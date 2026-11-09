// Assets are embedded at build time: one portable Worker ESM artifact.
import {assets} from '../../.sites-runtime/assets';
export default {async fetch(request:Request,env:unknown){const path=new URL(request.url).pathname;const asset=assets[path]??assets['/'];return new Response(asset.body,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff'}})}};
