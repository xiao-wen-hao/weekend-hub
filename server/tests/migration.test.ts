import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,sep} from "node:path";
import Database from "better-sqlite3";

test("fresh database and existing version one database migrate without data loss",()=>{
  const dir=mkdtempSync(join(tmpdir(),"zhoumoju-migrate-"));
  const file=join(dir,"weekend.db");
  const boot=()=>{
    const run=spawnSync(process.execPath,["--import","tsx","-e","import('./server/db.ts').then(m=>{console.log(m.db.pragma('user_version',{simple:true}));m.db.close()})"],{cwd:process.cwd(),env:{...process.env,DATA_DIR:dir},encoding:"utf8"});
    assert.equal(run.status,0,run.stderr);
    assert.match(run.stdout,/6/);
  };
  try{
    boot();
    const db=new Database(file);
    db.exec("DROP TABLE notification_outbox; DROP TABLE candidate_members; DROP TABLE candidates; DROP TABLE intents; DROP TABLE circle_members; DROP TABLE circles; PRAGMA user_version=1;");
    db.prepare("INSERT INTO users(id,username,display_name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)").run("saved-user","saved-user","保留用户","hash","salt","2026-11-14");
    db.close();
    boot();
    const upgraded=new Database(file);
    assert.ok(upgraded.prepare("SELECT id FROM users WHERE id='saved-user'").get());
    assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE name='notification_outbox'").get());
    upgraded.prepare("INSERT INTO notification_outbox(id,user_id,kind,payload_json,status,created_at,dedupe_key) VALUES(?,?,?,?,?,?,?)").run("saved-notice","saved-user","candidate","{\"candidateId\":\"saved\"}","pending","2026-11-14","candidate:saved");
    upgraded.close();
    boot();
    const restarted=new Database(file);
    const retained=restarted.prepare("SELECT kind,payload_json AS payload FROM notification_outbox WHERE id='saved-notice'").get() as {kind:string;payload:string}|undefined;
    assert.equal(retained?.kind,"candidate");
    assert.equal(JSON.parse(retained!.payload).candidateId,"saved");
    restarted.close();
  }finally{if(dir.startsWith(tmpdir()+sep))rmSync(dir,{recursive:true,force:true});}
});

