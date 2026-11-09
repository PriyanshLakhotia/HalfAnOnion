import {Miniflare} from 'miniflare';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
execFileSync('node',['scripts/build.mjs'],{stdio:'inherit'});
const args=process.argv;const port=Number(args[args.indexOf('--port')+1])||4173;
const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',port,host:'0.0.0.0',compatibilityDate:'2026-05-15',d1Databases:['DB'],d1Persist:'.wrangler/state',cf:false});
const db=await mf.getD1Database('DB');
await db.prepare('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)').run();
try{for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){if(!await db.prepare('SELECT name FROM __local_migrations WHERE name=?').bind(f).first()){for(const sql of (await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();await db.prepare('INSERT INTO __local_migrations VALUES (?)').bind(f).run();}}}catch(e){if(e.code!=='ENOENT')throw e;}
console.log('Preview at',String(await mf.ready));
