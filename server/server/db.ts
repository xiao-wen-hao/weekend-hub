import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir=path.resolve(process.env.DATA_DIR??"./data");
fs.mkdirSync(dataDir,{recursive:true});
export const db=new Database(path.join(dataDir,"weekend.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

const migration1=`
CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE rooms(id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, brief_json TEXT NOT NULL, phase TEXT NOT NULL, current_proposal_id TEXT, revision INTEGER NOT NULL DEFAULT 0, locks_json TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE members(room_id TEXT NOT NULL REFERENCES rooms(id), user_id TEXT NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL, PRIMARY KEY(room_id,user_id));
CREATE TABLE preferences(room_id TEXT NOT NULL, user_id TEXT NOT NULL, data_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL, PRIMARY KEY(room_id,user_id), FOREIGN KEY(room_id,user_id) REFERENCES members(room_id,user_id));
CREATE TABLE messages(id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE proposals(id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), version INTEGER NOT NULL, plan_json TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(room_id,version));
CREATE TABLE confirmations(proposal_id TEXT NOT NULL REFERENCES proposals(id), user_id TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(proposal_id,user_id));
CREATE TABLE polls(id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), proposal_id TEXT REFERENCES proposals(id), facet TEXT NOT NULL, question TEXT NOT NULL, options_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, closed_at TEXT);
CREATE TABLE poll_votes(poll_id TEXT NOT NULL REFERENCES polls(id), user_id TEXT NOT NULL REFERENCES users(id), option_id TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(poll_id,user_id));
CREATE TABLE attendance(proposal_id TEXT NOT NULL REFERENCES proposals(id), segment_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), decision TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(proposal_id,segment_id,user_id));
CREATE TABLE room_events(id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id), event_type TEXT NOT NULL, public_text TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX idx_messages_private ON messages(room_id,user_id,created_at);
CREATE INDEX idx_events_room ON room_events(room_id,created_at);
CREATE INDEX idx_polls_room ON polls(room_id,status);
`;

const version=db.pragma("user_version",{simple:true}) as number;
if(version<1){db.transaction(()=>{db.exec(migration1);db.pragma("user_version = 1");})();}

// Additive migration for installations created before circle and intent support.
const migration2=`
CREATE TABLE IF NOT EXISTS circles(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES users(id),join_code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS circle_members(circle_id TEXT NOT NULL REFERENCES circles(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('owner','admin','member')),PRIMARY KEY(circle_id,user_id));
CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY,circle_id TEXT NOT NULL REFERENCES circles(id),owner_id TEXT NOT NULL REFERENCES users(id),raw_text TEXT NOT NULL,category TEXT,window_id TEXT,status TEXT NOT NULL CHECK(status IN ('active','paused','withdrawn')),match_allowed INTEGER NOT NULL CHECK(match_allowed IN (0,1)),contact_allowed INTEGER NOT NULL CHECK(contact_allowed IN (0,1)),expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidates(id TEXT PRIMARY KEY,circle_id TEXT NOT NULL REFERENCES circles(id),category TEXT NOT NULL,window_id TEXT NOT NULL,status TEXT NOT NULL,member_key TEXT NOT NULL UNIQUE,room_id TEXT REFERENCES rooms(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS candidate_members(candidate_id TEXT NOT NULL REFERENCES candidates(id),user_id TEXT NOT NULL REFERENCES users(id),response TEXT NOT NULL,PRIMARY KEY(candidate_id,user_id));
CREATE TABLE IF NOT EXISTS notification_outbox(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,delivered_at TEXT);
CREATE INDEX IF NOT EXISTS idx_intents_match ON intents(circle_id,status,category,window_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_candidate_member ON candidate_members(user_id,response);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON notification_outbox(user_id,status,created_at);
`;
if(version<2){db.transaction(()=>{db.exec(migration2);db.pragma("user_version = 2");})();}

// Existing invite codes remain valid for seven days after upgrading.
const migration3=`
ALTER TABLE circles ADD COLUMN invite_expires_at TEXT;
ALTER TABLE circle_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
UPDATE circles SET invite_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days') WHERE invite_expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_circle_active_member ON circle_members(circle_id,user_id,status);
`;
if(version<3){db.transaction(()=>{db.exec(migration3);db.pragma("user_version = 3");})();}



const migration4=`
ALTER TABLE intents ADD COLUMN parsed_json TEXT;
ALTER TABLE intents ADD COLUMN confirmed_at TEXT;
`;
if(version<4){db.transaction(()=>{db.exec(migration4);db.pragma("user_version = 4");})();}

const migration5=`
ALTER TABLE candidates ADD COLUMN expires_at TEXT;
UPDATE candidates SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+48 hours') WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_candidates_expiry ON candidates(status,expires_at);
`;
if(version<5){db.transaction(()=>{db.exec(migration5);db.pragma("user_version = 5");})();}

const migration6=`
ALTER TABLE notification_outbox ADD COLUMN dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_dedupe ON notification_outbox(dedupe_key);
`;
if(version<6){db.transaction(()=>{db.exec(migration6);db.pragma("user_version = 6");})();}

// A durable barrier between a changed input and a proposal that members may confirm.
const migration7=`
ALTER TABLE rooms ADD COLUMN coordination_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN coordination_epoch INTEGER NOT NULL DEFAULT 0;
`;
if(version<7){db.transaction(()=>{db.exec(migration7);db.pragma("user_version = 7");})();}

// V2 public collaboration records are additive; existing private messages stay private.
const migration8=`
ALTER TABLE rooms ADD COLUMN mode TEXT NOT NULL DEFAULT 'template' CHECK(mode IN ('blank','template'));
CREATE TABLE room_public_shares(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),author_id TEXT NOT NULL REFERENCES users(id),source_message_id TEXT REFERENCES messages(id),public_text TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE room_bulletins(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),version INTEGER NOT NULL,content_json TEXT NOT NULL,source_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(room_id,version));
CREATE INDEX idx_public_shares_room ON room_public_shares(room_id,created_at);
CREATE INDEX idx_bulletins_room ON room_bulletins(room_id,version);
`;
if(version<8){db.transaction(()=>{db.exec(migration8);db.pragma("user_version = 8");})();}

const migration9=`
ALTER TABLE candidates ADD COLUMN match_reason_json TEXT;
`;
if(version<9){db.transaction(()=>{db.exec(migration9);db.pragma("user_version = 9");})();}

const migration10=`
CREATE TABLE room_share_annotations(share_id TEXT PRIMARY KEY REFERENCES room_public_shares(id),room_id TEXT NOT NULL REFERENCES rooms(id),kind TEXT NOT NULL CHECK(kind IN ('provisional','disagreement')),excerpt TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('model','fallback')),created_at TEXT NOT NULL);
CREATE INDEX idx_share_annotations_room ON room_share_annotations(room_id);
`;
if(version<10){db.transaction(()=>{db.exec(migration10);db.pragma("user_version = 10");})();}

const migration11=`
CREATE TABLE room_circle_invites(room_id TEXT NOT NULL REFERENCES rooms(id),circle_id TEXT NOT NULL REFERENCES circles(id),user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted')),created_at TEXT NOT NULL,PRIMARY KEY(room_id,user_id));
CREATE INDEX idx_room_circle_invites_circle ON room_circle_invites(circle_id,user_id);
`;
if(version<11){db.transaction(()=>{db.exec(migration11);db.pragma("user_version = 11");})();}

const migration12=`
CREATE TABLE room_public_guidance(room_id TEXT PRIMARY KEY REFERENCES rooms(id),source_ids_json TEXT NOT NULL,content_json TEXT NOT NULL,created_at TEXT NOT NULL);
`;
if(version<12){db.transaction(()=>{db.exec(migration12);db.pragma("user_version = 12");})();}

const migration13=`
UPDATE rooms SET date=(SELECT json_extract(p.plan_json,'$.date') FROM proposals p WHERE p.id=rooms.current_proposal_id)
WHERE date='待定' AND current_proposal_id IS NOT NULL
AND (SELECT json_extract(p.plan_json,'$.date') FROM proposals p WHERE p.id=rooms.current_proposal_id) GLOB '????-??-??';
`;
if(version<13){db.transaction(()=>{db.exec(migration13);db.pragma("user_version = 13");})();}

const migration14=`
CREATE TABLE room_circle_invites_new(room_id TEXT NOT NULL REFERENCES rooms(id),circle_id TEXT NOT NULL REFERENCES circles(id),user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','revoked','expired')),invited_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,decided_at TEXT,PRIMARY KEY(room_id,user_id));
INSERT INTO room_circle_invites_new(room_id,circle_id,user_id,status,invited_by,created_at) SELECT i.room_id,i.circle_id,i.user_id,i.status,r.created_by,i.created_at FROM room_circle_invites i JOIN rooms r ON r.id=i.room_id;
INSERT OR IGNORE INTO room_circle_invites_new(room_id,circle_id,user_id,status,invited_by,created_at) SELECT c.room_id,c.circle_id,cm.user_id,CASE WHEN m.user_id IS NULL THEN 'pending' ELSE 'accepted' END,r.created_by,r.created_at FROM candidates c JOIN rooms r ON r.id=c.room_id JOIN candidate_members cm ON cm.candidate_id=c.id LEFT JOIN members m ON m.room_id=c.room_id AND m.user_id=cm.user_id WHERE c.status='opened' AND c.room_id IS NOT NULL AND cm.response IN ('pending','yes','later');
DROP TABLE room_circle_invites;
ALTER TABLE room_circle_invites_new RENAME TO room_circle_invites;
CREATE INDEX idx_room_circle_invites_circle ON room_circle_invites(circle_id,user_id);
`;
if(version<14){db.transaction(()=>{db.exec(migration14);db.pragma("user_version = 14");})();}

if(version<15){db.transaction(()=>{db.exec("ALTER TABLE members ADD COLUMN decision_status TEXT NOT NULL DEFAULT 'undecided' CHECK(decision_status IN ('undecided','yes','no')); UPDATE members SET decision_status='yes';");db.pragma("user_version = 15");})();}

export type RoomRow={id:string;title:string;date:string;mode:'blank'|'template';brief_json:string;phase:string;current_proposal_id:string|null;revision:number;coordination_pending:number;coordination_epoch:number;locks_json:string;created_by:string;created_at:string;updated_at:string};
export type UserRow={id:string;username:string;display_name:string;password_hash:string;salt:string;created_at:string};
export const now=()=>new Date().toISOString();
export const uid=()=>crypto.randomUUID();
export const getRoom=(id:string)=>db.prepare("SELECT * FROM rooms WHERE id=?").get(id) as RoomRow|undefined;
export const getUser=(id:string)=>db.prepare("SELECT * FROM users WHERE id=?").get(id) as UserRow|undefined;
export const isMember=(roomId:string,userId:string)=>!!db.prepare("SELECT 1 FROM members WHERE room_id=? AND user_id=?").get(roomId,userId);

