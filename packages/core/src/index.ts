export type LogLevel = 'TRACE'|'DEBUG'|'INFO'|'WARNING'|'ERROR'|'FATAL'|'UNKNOWN';
export type ConnectionStatus='idle'|'connecting'|'connected'|'disconnected'|'error';
export interface LogEntry {id:string;timestamp:string;level:LogLevel;message:string;sourceId:string;service?:string;traceId?:string;metadata:Record<string,unknown>;raw:unknown}
export interface FieldMapping {listPath?:string;rawTextPath?:string;fields?:{id?:string;timestamp?:string;level?:string;message?:string;service?:string;traceId?:string};defaultLevel?:LogLevel; transform?:(input:unknown)=>unknown[];mapRecord?:(record:unknown)=>Partial<LogEntry>}
export interface SourceContext {signal:AbortSignal;emit:(items:unknown[])=>void;setStatus:(status:ConnectionStatus)=>void;onError:(error:Error)=>void}
export interface LogSourceAdapter<T=unknown>{type:string;connect:(config:T,context:SourceContext)=>Promise<void>;disconnect:()=>Promise<void>}
export interface LogSource<T=unknown>{id:string;name:string;type:string;config:T;mapping?:FieldMapping}
export type LogListener=(entries:LogEntry[])=>void;
export interface LogPlugin {id:string;setup:(engine:LogEngine)=>void|(()=>void)}
export function pathValue(value:unknown,path?:string):unknown {if(!path)return value;return path.split('.').reduce<unknown>((v,key)=>{if(v===null||typeof v!=='object')return undefined;return (v as Record<string,unknown>)[key]},value)}
export function normalizeLevel(v:unknown):LogLevel {const t=String(v??'UNKNOWN').toUpperCase();if(t==='WARN')return 'WARNING';if(t==='CRITICAL')return 'FATAL';if(t==='EXCEPTION')return 'ERROR';return ['TRACE','DEBUG','INFO','WARNING','ERROR','FATAL'].includes(t)?t as LogLevel:'UNKNOWN'}
export function parseText(text:string):unknown[]{
 const blocks:string[]=[];
 const begins=/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?/;
 for(const line of text.split(/\r?\n/)){
   if(begins.test(line)||blocks.length===0)blocks.push(line);
   else blocks[blocks.length-1]+='\n'+line;
 }
 return blocks.filter(Boolean).map(raw=>{
   // Python logging: timestamp - executable/logger - LEVEL - [tags] message (file.py:123)
   const python=raw.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?)\s+-\s+(.+?)\s+-\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|EXCEPTION|FATAL|CRITICAL)\s+-\s+([\s\S]*)$/i);
   if(python){const match=python[4].match(/^((?:\[[^\]]+\])+)/);return {timestamp:python[1],service:python[2],level:python[3],message:python[4],tags:match?.[1].match(/\[([^\]]+)\]/g)?.map(t=>t.slice(1,-1)),rawText:raw}}
   const standard=raw.match(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[,.]\d{3})?)\s+(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|EXCEPTION|FATAL|CRITICAL)\b[\s:–-]*([\s\S]*)$/i);
   return standard?{timestamp:standard[1],level:standard[2],message:standard[3]||raw,rawText:raw}:{message:raw,rawText:raw};
 });
}
const toISO=(v:unknown)=>{if(typeof v==='number')return new Date(v<1e11?v*1000:v).toISOString();if(typeof v==='string'){const date=new Date(v.replace(/^([0-9-]+) ([0-9:]+),([0-9]{3})/,'$1T$2.$3Z'));if(!Number.isNaN(date.getTime()))return date.toISOString()}return new Date().toISOString()};
export function normalizeResponse(response:unknown,sourceId:string,mapping:FieldMapping={}):LogEntry[]{let items:unknown[];if(mapping.transform)items=mapping.transform(response);else{const extracted=pathValue(response,mapping.listPath);items=Array.isArray(extracted)?extracted:[extracted]};const output:LogEntry[]=[];for(const item of items){let records:unknown[];const rawText=mapping.rawTextPath?pathValue(item,mapping.rawTextPath):undefined;if(typeof rawText==='string')records=parseText(rawText);else if(typeof item==='string')records=parseText(item);else records=[item];for(const record of records){if(record===undefined||record===null)continue;const obj=record&&typeof record==='object'?record as Record<string,unknown>:{message:String(record)};const f=mapping.fields??{};const extra=mapping.mapRecord?.(record)??{};const field=(path?:string)=>path?pathValue(record,path):undefined;const timestamp=toISO(extra.timestamp??field(f.timestamp)??obj.timestamp??obj.createdAt??obj.time);const level=normalizeLevel(extra.level??field(f.level)??obj.level??obj.severity??obj.type??mapping.defaultLevel);const message=String(extra.message??field(f.message)??obj.message??obj.text??obj.rawText??JSON.stringify(obj));const id=String(extra.id??field(f.id)??obj.id??obj._id??`${sourceId}-${timestamp}-${message.slice(0,80)}`);output.push({id,timestamp,level,message,sourceId,service:String(extra.service??field(f.service)??obj.service??obj.module??''),traceId:String(extra.traceId??field(f.traceId)??obj.traceId??''),metadata:extra.metadata??obj,raw:record})}}return output}
export function matchesQuery(entry:LogEntry,q:string){const text=`${entry.message} ${entry.service??''} ${entry.level} ${entry.traceId??''}`.toLowerCase();return q.toLowerCase().split('|').some(group=>group.split('+').map(x=>x.trim()).filter(Boolean).every(term=>text.includes(term)))}
export class LogEngine {
 private store:LogEntry[]=[];private adapter?:LogSourceAdapter<any>;private controller?:AbortController;private listeners=new Set<LogListener>();private statusListeners=new Set<(s:ConnectionStatus)=>void>();private status:ConnectionStatus='idle';private plugins=new Map<string,()=>void>();constructor(public readonly maxEntries=10000){}
 subscribe(listener:LogListener){this.listeners.add(listener);listener(this.store);return()=>{this.listeners.delete(listener)}}
 subscribeStatus(listener:(s:ConnectionStatus)=>void){this.statusListeners.add(listener);listener(this.status);return()=>{this.statusListeners.delete(listener)}}
 getEntries(){return this.store}
 getStatus(){return this.status}
 setStatus(s:ConnectionStatus){this.status=s;this.statusListeners.forEach(fn=>fn(s))}
 append(entries:LogEntry[]){const seen=new Set(this.store.map(x=>x.id));const fresh=entries.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true});this.store=[...this.store,...fresh].slice(-this.maxEntries);this.listeners.forEach(fn=>fn(this.store))}
 clear(){this.store=[];this.listeners.forEach(fn=>fn(this.store))}
 install(plugin:LogPlugin){if(this.plugins.has(plugin.id))return;this.plugins.set(plugin.id,plugin.setup(this)||(()=>{}))}
 async connect(source:LogSource,adapter:LogSourceAdapter<any>,onError?:(error:Error)=>void){await this.disconnect();this.clear();this.adapter=adapter;this.controller=new AbortController();const reportError=(error:Error)=>{console.error('[LogScope]',error);this.setStatus('error');onError?.(error)};const context:SourceContext={signal:this.controller.signal,emit:(items)=>{if(!this.controller?.signal.aborted)this.append(items.flatMap(item=>normalizeResponse(item,source.id,source.mapping)))},setStatus:(status)=>this.setStatus(status),onError:reportError};this.setStatus('connecting');try{await adapter.connect(source.config,context)}catch(e){if(!this.controller.signal.aborted)reportError(e instanceof Error?e:new Error(String(e)))}}
 async disconnect(){this.controller?.abort();if(this.adapter)await this.adapter.disconnect();this.adapter=undefined;this.setStatus('disconnected')}
 async dispose(){await this.disconnect();this.plugins.forEach(fn=>fn());this.plugins.clear();this.listeners.clear();this.statusListeners.clear()}
}
export { detectResponse } from './autodetect';
