"""Reproducible Cloud Run deployment using Application Default Credentials.
Install google-auth and requests in a venv. Run gcp-bootstrap.sh once as admin.
Phases: prepare, build, deploy, schedules, verify. Secrets never appear in output.
"""
import argparse
import base64
import io
import json
import os
import secrets
import tarfile
import time
from pathlib import Path
import google.auth
from google.auth.transport.requests import AuthorizedSession

PROJECT = 'halfanonion'
NUMBER = '936488563396'
REGION = 'europe-west4'
SERVICE = 'half-an-onion-companion'
STATE_BUCKET = PROJECT + '-companion-state'
BUILD_BUCKET = PROJECT + '-companion-builds'
REPOSITORY = 'onion'
SITE = 'https://half-an-onion.techstuff19.chatgpt.site'
RUNTIME = f'onion-runtime@{PROJECT}.iam.gserviceaccount.com'
BUILDER = f'onion-builder@{PROJECT}.iam.gserviceaccount.com'
SCHEDULER = f'onion-scheduler@{PROJECT}.iam.gserviceaccount.com'
ROOT = Path(__file__).resolve().parents[1]
credentials, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
session = AuthorizedSession(credentials)

def call(method, url, **kwargs):
    response = session.request(method, url, timeout=120, **kwargs)
    if not response.ok:
        # Cloud errors describe permissions/resources, never dump request bodies.
        try: message = response.json().get('error', {}).get('message', 'request failed')
        except ValueError: message = response.text[:200]
        raise RuntimeError(f'{method} {url}: {response.status_code} {message}')
    return response.json() if response.content else {}

def exists(url):
    r = session.get(url, timeout=30)
    if r.status_code == 404: return False
    if not r.ok: raise RuntimeError(f'Cannot inspect {url}: {r.status_code}')
    return True

def poll(url, label):
    for _ in range(160):
        result = call('GET', url)
        if result.get('done'):
            if 'error' in result: raise RuntimeError(json.dumps(result['error']))
            return result.get('response', {})
        print(label + ' pending', flush=True)
        time.sleep(10)
    raise RuntimeError(label + ' is still pending; inspect the existing operation before retrying')

def poll_build(build_id):
    url = f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/builds/{build_id}'
    for _ in range(160):
        result = call('GET', url)
        status = result['status']
        if status == 'SUCCESS': return result
        if status not in ['QUEUED', 'WORKING', 'PENDING']:
            raise RuntimeError('Build ' + status + ': ' + json.dumps(result.get('failureInfo', {})))
        print('Build ' + status, flush=True)
        time.sleep(10)
    raise RuntimeError('Build remains pending: ' + build_id)

def policy_binding(url, member, role, method='POST'):
    policy = call('GET', url + ('/iam' if method == 'PUT' else ':getIamPolicy'))
    bindings = policy.setdefault('bindings', [])
    binding = next((b for b in bindings if b['role'] == role and 'condition' not in b), None)
    if binding is None:
        binding = {'role': role, 'members': []}; bindings.append(binding)
    if member not in binding['members']: binding['members'].append(member)
    return call(method, url + ('/iam' if method == 'PUT' else ':setIamPolicy'), json=policy if method == 'PUT' else {'policy': policy})

def prepare():
    for bucket, lifetime in [(STATE_BUCKET, None), (BUILD_BUCKET, 7)]:
        url = 'https://storage.googleapis.com/storage/v1/b/' + bucket
        if not exists(url):
            settings = {'name': bucket, 'location': REGION, 'iamConfiguration': {'uniformBucketLevelAccess': {'enabled': True}, 'publicAccessPrevention': 'enforced'}, 'softDeletePolicy': {'retentionDurationSeconds': '0'}}
            if lifetime: settings['lifecycle'] = {'rule': [{'action': {'type': 'Delete'}, 'condition': {'age': lifetime}}]}
            try:
                call('POST', 'https://storage.googleapis.com/storage/v1/b', params={'project': PROJECT}, json=settings)
            except RuntimeError as error:
                if 'identity_unsupported_request' not in str(error): raise
                # Managed workload identity does not implement bucket insertion.
                # Use the already authorized Cloud Build identity for this operation.
                op = call('POST', f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/builds', json={
                    'steps': [{'name':'gcr.io/google.com/cloudsdktool/google-cloud-cli:stable', 'entrypoint':'gcloud', 'args':['storage','buckets','create','gs://'+bucket,'--project='+PROJECT,'--location='+REGION,'--uniform-bucket-level-access','--public-access-prevention']}],
                    'serviceAccount':f'projects/{PROJECT}/serviceAccounts/{BUILDER}', 'options':{'logging':'CLOUD_LOGGING_ONLY'}, 'timeout':'300s'})
                poll_build(op['metadata']['build']['id'])
        # Also apply retention rules when a previous attempt created the bucket.
        patch = {'softDeletePolicy': {'retentionDurationSeconds':'0'}}
        if lifetime: patch['lifecycle'] = {'rule':[{'action':{'type':'Delete'},'condition':{'age':lifetime}}]}
        try: call('PATCH', url, json=patch)
        except RuntimeError as error:
            if 'identity_unsupported_request' not in str(error): raise
            print('Bucket retention unchanged: managed identity does not support metadata PATCH. Configure cleanup in Cloud Console.')
        if bucket == STATE_BUCKET:
            policy_binding(url, 'serviceAccount:' + RUNTIME, 'roles/storage.objectUser', method='PUT')
    repo = f'https://artifactregistry.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/repositories/{REPOSITORY}'
    if not exists(repo):
        op = call('POST', repo.rsplit('/',1)[0], params={'repositoryId': REPOSITORY}, json={'format': 'DOCKER', 'description': 'Half an Onion companion', 'cleanupPolicies': {'old-images': {'id': 'old-images', 'action': 'DELETE', 'condition': {'tagState': 'ANY', 'olderThan': '1209600s'}}, 'keep-recent': {'id': 'keep-recent', 'action': 'KEEP', 'mostRecentVersions': {'keepCount': 3}}}, 'cleanupPolicyDryRun': False})
        poll('https://artifactregistry.googleapis.com/v1/' + op['name'], 'Artifact repository')
    for name in ['onion-bridge-secret', 'onion-site-access']:
        url = f'https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/{name}'
        if not exists(url):
            call('POST', url.rsplit('/',1)[0], params={'secretId': name}, json={'replication': {'automatic': {}}})
        policy_binding(url, 'serviceAccount:' + RUNTIME, 'roles/secretmanager.secretAccessor')
        versions = call('GET', url + '/versions').get('versions', [])
        if name == 'onion-bridge-secret' and not versions:
            value = secrets.token_urlsafe(48).encode()
            call('POST', url + ':addVersion', json={'payload': {'data': base64.b64encode(value).decode()}})
    print('Durable storage, registry and secret containers prepared.')

def build():
    import subprocess
    sha = subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip()
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip(): raise RuntimeError('Commit source before building')
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode='w:gz') as tar:
        for path in (ROOT / 'companion').iterdir():
            if path.is_file() and path.name not in ['README.md'] and not path.name.startswith('.env'): tar.add(path, arcname=path.name)
    obj = 'source/' + sha + '.tar.gz'
    call('POST', f'https://storage.googleapis.com/upload/storage/v1/b/{BUILD_BUCKET}/o', params={'uploadType':'media','name':obj}, headers={'Content-Type':'application/gzip'}, data=archive.getvalue())
    image = f'{REGION}-docker.pkg.dev/{PROJECT}/{REPOSITORY}/companion:{sha}'
    op = call('POST', f'https://cloudbuild.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/builds', json={
        'source': {'storageSource': {'bucket': BUILD_BUCKET, 'object': obj}},
        'steps': [{'name': 'gcr.io/cloud-builders/docker', 'args': ['build','-t',image,'.']}],
        'images': [image], 'timeout': '1200s', 'serviceAccount': f'projects/{PROJECT}/serviceAccounts/{BUILDER}',
        'options': {'logging':'CLOUD_LOGGING_ONLY'},
    })
    print(json.dumps({'build_operation':op['name'],'image':image}),flush=True)
    poll_build(op['metadata']['build']['id'])
    print('Image built: ' + image)

def deploy():
    import subprocess
    sha = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    url = f'https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}'
    env = [{'name':'STATE_BUCKET','value':STATE_BUCKET}, {'name':'SITE_URL','value':SITE}, {'name':'SCHEDULER_EMAIL','value':SCHEDULER}]
    for name, secret in [('BRIDGE_SECRET','onion-bridge-secret'),('SITE_ACCESS_TOKEN','onion-site-access')]:
        env.append({'name':name,'valueSource':{'secretKeyRef':{'secret':secret,'version':'latest'}}})
    payload = {'ingress':'INGRESS_TRAFFIC_ALL', 'scaling':{'minInstanceCount':0,'maxInstanceCount':1},
        'template': {'serviceAccount':RUNTIME,'timeout':'210s','maxInstanceRequestConcurrency':4,
        'scaling': {'minInstanceCount':0,'maxInstanceCount':1},
        'containers':[{'image':f'{REGION}-docker.pkg.dev/{PROJECT}/{REPOSITORY}/companion:{sha}', 'env':env,
        'ports':[{'containerPort':8080}], 'resources':{'limits':{'cpu':'2','memory':'2Gi'},'cpuIdle':True,'startupCpuBoost':True},
        'startupProbe':{'httpGet':{'path':'/healthz','port':8080},'periodSeconds':5,'timeoutSeconds':3,'failureThreshold':24}}]}}
    present = exists(url)
    if present:
        old = call('GET',url)
        env.append({'name':'SERVICE_URL','value':old['uri']})
    op = call('PATCH' if present else 'POST', url if present else url.rsplit('/',1)[0], params={} if present else {'serviceId':SERVICE}, json=payload)
    service = poll('https://run.googleapis.com/v2/' + op['name'], 'Cloud Run')
    # Anonymous platform ingress is necessary for the Sites server's bearer credential.
    # Every application operation still requires bridge auth or verified Scheduler OIDC.
    policy_binding(f'https://run.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}', 'allUsers', 'roles/run.invoker')
    if not present:
        env.append({'name':'SERVICE_URL','value':service['uri']})
        op = call('PATCH',url,params={'updateMask':'template.containers'},json={'template':{'containers':payload['template']['containers']}})
        service = poll('https://run.googleapis.com/v2/' + op['name'], 'Service audience')
    print(json.dumps({'service_url':service['uri'],'revision':service.get('latestReadyRevision')}))

def schedules():
    service = call('GET',f'https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}')
    base = f'https://cloudscheduler.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/jobs'
    jobs = {'recipes':'0 9 * * *','offers-AH':'0 14 * * 5','offers-ALDI':'0 14 * * 3','offers-Jumbo':'0 14 * * 6','offers-PLUS':'20 14 * * 6'}
    for job, schedule in jobs.items():
        name = f'projects/{PROJECT}/locations/{REGION}/jobs/onion-{job.lower()}'
        payload = {'name':name,'schedule':schedule,'timeZone':'Europe/Amsterdam','attemptDeadline':'210s',
            'retryConfig':{'retryCount':2,'minBackoffDuration':'300s','maxBackoffDuration':'900s'},
            'httpTarget':{'uri':service['uri'] + '/jobs/' + job,'httpMethod':'POST','headers':{'Content-Type':'application/json'},'body':base64.b64encode(b'{}').decode(),
                'oidcToken':{'serviceAccountEmail':SCHEDULER,'audience':service['uri']}}}
        if exists(base+'/'+name.split('/')[-1]): call('PATCH',base+'/'+name.split('/')[-1],json=payload)
        else: call('POST',base,json=payload)
        print('Scheduled ' + job + ': ' + schedule + ' Europe/Amsterdam')

def verify():
    service = call('GET',f'https://run.googleapis.com/v2/projects/{PROJECT}/locations/{REGION}/services/{SERVICE}')
    print(json.dumps({k:service.get(k) for k in ['uri','terminalCondition','scaling','latestReadyRevision']},indent=2))
    resource = service['template']['containers'][0]['resources']
    assert resource['cpuIdle'] and service['template']['scaling'].get('minInstanceCount',0) == 0
    print('Verified request-based CPU and zero minimum instances.')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('phase', choices=['prepare','build','deploy','schedules','verify'])
    globals()[parser.parse_args().phase]()
