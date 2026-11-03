import { readFile } from 'node:fs/promises';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
const {doc,collection,query,where,limit,orderBy,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp,Timestamp,writeBatch}=sdk;
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080') throw Error('Local emulator required');
let env;
const db=(uid,verified=true,email=`${uid}@example.invalid`)=>env.authenticatedContext(uid,{email_verified:verified,email}).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-objectif-coaching',firestore:{host:'127.0.0.1',port:8080,rules:await readFile(new URL('../../firebase/firestore.coaching.rules',import.meta.url),'utf8')}})});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  for(const [path,value] of [
   ['settings/access',{coachUid:'coach',active:true}],
   ['athletes/alice',{enrolled:true,invitedBy:'coach'}],
   ['coaches/coach/athletes/alice',{status:'active'}],
   ['invitations/pending',{coachUid:'coach',email:'alice@example.invalid',status:'pending',expiresAt:Timestamp.fromMillis(Date.now()+86400000)}],
   ['athletes/alice/programs/tractions-12-v1',{schemaVersion:1,score:2,notes:'ancien',revision:1,updatedAt:Timestamp.fromMillis(1000)}]
  ])await setDoc(doc(c.firestore(),path),value);
 });
});
after(async()=>env?.cleanup());
test('Invitations : recherche limitée à sa propre adresse vérifiée, jamais par un lien anonyme',async()=>{
 const own=query(collection(db('alice'),'invitations'),where('email','==','alice@example.invalid'));
 assert.equal((await assertSucceeds(getDocs(own))).size,1);
 await assertFails(getDocs(collection(db('alice'),'invitations')));
 await assertFails(getDocs(query(collection(db('bob'),'invitations'),where('email','==','alice@example.invalid'))));
 await assertFails(getDocs(query(collection(db('alice',false),'invitations'),where('email','==','alice@example.invalid'))));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'invitations/pending')));
});
const messages=(database,uid='alice',count=50)=>query(collection(database,'athletes',uid,'messages'),orderBy('createdAt','desc'),limit(count));
const message=(sender='alice')=>({senderUid:sender,text:'Conseil privé',createdAt:serverTimestamp()});
test('Messages : seuls le sportif et son coach actif lisent et écrivent dans leur conversation',async()=>{
 await assertSucceeds(setDoc(doc(db('coach'),'athletes/alice/messages/coach-message'),message('coach')));
 await assertSucceeds(setDoc(doc(db('alice'),'athletes/alice/messages/reponse'),message()));
 for(const who of ['alice','coach'])assert.equal((await assertSucceeds(getDocs(messages(db(who))))).size,2);
 for(const who of ['bob','other']){await assertFails(getDocs(messages(db(who))));await assertFails(setDoc(doc(db(who),'athletes/alice/messages/intrusion'),message(who)));}
 await assertFails(getDocs(messages(db('alice',false))));
 await assertFails(getDocs(query(collection(db('alice'),'athletes/alice/messages'),limit(51))));
});
test('Messages : auteur, taille, date et immutabilité contrôlés',async()=>{
 const ref=doc(db('alice'),'athletes/alice/messages/message');
 for(const value of [{...message(),senderUid:'coach'},{...message(),text:''},{...message(),text:'a'.repeat(2001)},{...message(),createdAt:Timestamp.fromMillis(1000)},{...message(),extra:true}])await assertFails(setDoc(ref,value));
 await assertSucceeds(setDoc(ref,message()));await assertFails(updateDoc(ref,{text:'modifié'}));await assertFails(deleteDoc(ref));
});
test('Révocation ou coach inactif : conversation fermée des deux côtés ; statut propre seul lisible',async()=>{
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'athletes/alice'),{enrolled:false}));
 await assertSucceeds(getDoc(doc(db('alice'),'athletes/alice')));
 await assertFails(getDoc(doc(db('bob'),'athletes/alice')));
 for(const who of ['alice','coach']){await assertFails(getDocs(messages(db(who))));await assertFails(setDoc(doc(db(who),'athletes/alice/messages/refus'),message(who)));await assertFails(getDoc(doc(db(who),'athletes/alice/programs/tractions-12-v1')));}
 await env.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'athletes/alice'),{enrolled:true});await updateDoc(doc(c.firestore(),'settings/access'),{active:false})});
 for(const who of ['alice','coach'])await assertFails(getDocs(messages(db(who))));
});
const program=(score=3)=>({schemaVersion:1,score,notes:'nouveau',revision:2,updatedAt:serverTimestamp()});
function archive(database,value=program(),id='program-2'){
 const batch=writeBatch(database);batch.set(doc(database,'athletes/alice/programs/tractions-12-v1'),value);
 batch.set(doc(database,`athletes/alice/programs/tractions-12-v1/history/${id}`),{documentId:'program',revision:2,value,recordedAt:serverTimestamp()});return batch.commit();
}
test('Historique : version atomique exacte, datée, immuable et privée',async()=>{
 await assertSucceeds(archive(db('alice')));
 const path='athletes/alice/programs/tractions-12-v1/history/program-2';
 for(const who of ['alice','coach'])await assertSucceeds(getDoc(doc(db(who),path)));
 await assertFails(getDoc(doc(db('bob'),path)));
 await assertFails(updateDoc(doc(db('alice'),path),{revision:3}));await assertFails(deleteDoc(doc(db('alice'),path)));
 await assertFails(getDocs(collection(db('alice'),'athletes/alice/programs/tractions-12-v1/history')));
 await assertSucceeds(getDocs(query(collection(db('coach'),'athletes/alice/programs/tractions-12-v1/history'),orderBy('recordedAt','desc'),limit(50))));
});
test('Historique : pas de fabrication de résultat, de faux numéro ou de modification par le coach',async()=>{
 await assertFails(archive(db('alice'),program(),'program-999'));
 await assertFails(archive(db('coach')));
 await assertFails(setDoc(doc(db('alice'),'athletes/alice/programs/tractions-12-v1/history/program-1'),{documentId:'program',revision:1,value:program(),recordedAt:serverTimestamp()}));
 const database=db('alice'),batch=writeBatch(database),value=program();batch.set(doc(database,'athletes/alice/programs/tractions-12-v1'),value);
 batch.set(doc(database,'athletes/alice/programs/tractions-12-v1/history/program-2'),{documentId:'program',revision:2,value:{...value,score:30},recordedAt:serverTimestamp()});await assertFails(batch.commit());
});
async function moduleAt(file,replacements){let source=await readFile(new URL(file,import.meta.url),'utf8');for(const [from,to]of replacements)source=source.replace(from,to);return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))}
test('Client réel : résultat et historique synchronisés atomiquement sans perte du suivi existant',async()=>{
 globalThis.coachingContext={sdk,db:db('alice')};
 const {createAthleteData}=await moduleAt('../../js/athlete-data.js',[["import { cloud } from './cloud.js';",'const cloud=async()=>globalThis.coachingContext;'],["import { PROGRAM } from './athlete-store.js';","const PROGRAM='tractions-12-v1';"]]);
 const client=createAthleteData();const result=await client.exchange('alice','1',{dirty:true,base:0,value:{completed:true,completedAt:null,performance:5,comments:'test'}});
 assert.equal(result.revision,1);const history=await client.readHistory('alice');assert.equal(history.entries[0].value.performance,5);
 assert.equal((await getDoc(doc(db('alice'),'athletes/alice/programs/tractions-12-v1'))).data().notes,'ancien');
});
test('Client messagerie : même identifiant après délai ou reprise, un seul message conservé',async()=>{
 globalThis.coachingContext={sdk,db:db('alice')};
 const {createMessagesClient}=await moduleAt('../../js/messages.js',[["import { cloud } from './cloud.js';",'const cloud=async()=>globalThis.coachingContext;'],["import { bounded } from './athlete-session.js';",'const bounded=action=>action();']]);
 const client=createMessagesClient(),user={uid:'alice',emailVerified:true};
 await client.send(user,'alice','Bonjour','unique');await client.send(user,'alice','Bonjour','unique');
 assert.equal((await client.list('alice')).messages.length,1);
 await assert.rejects(client.send(user,'alice','Autre contenu','unique'));
});
