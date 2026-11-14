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


export type RoomRow={id:string;title:string;date:string;brief_json:string;phase:string;current_proposal_id:string|null;revision:number;locks_json:string;created_by:string;created_at:string;updated_at:string};
export type UserRow={id:string;username:string;display_name:string;password_hash:string;salt:string;created_at:string};
export const now=()=>new Date().toISOString();
export const uid=()=>crypto.randomUUID();
export const getRoom=(id:string)=>db.prepare("SELECT * FROM rooms WHERE id=?").get(id) as RoomRow|undefined;
export const getUser=(id:string)=>db.prepare("SELECT * FROM users WHERE id=?").get(id) as UserRow|undefined;
export const isMember=(roomId:string,userId:string)=>!!db.prepare("SELECT 1 FROM members WHERE room_id=? AND user_id=?").get(roomId,userId);
