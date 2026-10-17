import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { File as NativeFile } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import { VideoView, useVideoPlayer } from "expo-video";
import { requestUploadUrl, completeMediaUpload, type MediaAttachment } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

const absolute = (path: string) => `https://${process.env.EXPO_PUBLIC_DOMAIN}${path}`;

export async function uploadDeviceMedia(uri: string, name: string, contentType: string, purpose: "chat"|"status"|"post", chatId?: string, webFile?: globalThis.File) {
  // Native File is a streaming Blob supported by expo/fetch. Bytes never pass
  // through our JSON API or PostgreSQL.
  const file=Platform.OS==="web"?(webFile||await (await fetch(uri)).blob()):new NativeFile(uri);
  if(!file.size||file.size>25*1024*1024)throw new Error("Choose a photo or video under 25 MB");
  const ticket=await requestUploadUrl({name:name.slice(0,150),size:file.size,contentType,purpose,chatId});
  const response=await expoFetch(ticket.uploadUrl,{method:"PUT",headers:{"Content-Type":contentType},body:file});
  if(!response.ok)throw new Error("Upload failed. Please try again.");
  return completeMediaUpload(ticket.id);
}

export function MobileMediaPicker({purpose,chatId,onChange,disabled}:{purpose:"chat"|"status";chatId?:string;onChange:(m:MediaAttachment)=>void;disabled?:boolean}) {
  const colors=useColors();
  const [busy,setBusy]=useState(false);
  async function pick() {
    setBusy(true);
    try{
      const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images","videos"],quality:0.8,videoMaxDuration:60});
      if(result.canceled)return;
      const asset=result.assets[0];
      const mime=asset.mimeType|| (asset.type==="video"?"video/mp4":"image/jpeg");
      if(!["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm"].includes(mime))throw new Error("Choose a JPEG, PNG, WebP, GIF, MP4 or WebM file. Export HEIC photos or MOV videos first.");
      onChange(await uploadDeviceMedia(asset.uri,asset.fileName||`media.${mime.split("/")[1]}`,mime,purpose,chatId,asset.file));
    }catch(e){Alert.alert("Couldn't upload media",e instanceof Error?e.message:"Please try again.");}
    finally{setBusy(false);}
  }
  return <Pressable accessibilityLabel="Attach photo or video" disabled={busy||disabled} onPress={pick} style={{padding:10,minWidth:44,minHeight:44}}>
    {busy?<ActivityIndicator color={colors.primary}/>:<Feather name="paperclip" size={20} color={colors.primary}/>}
  </Pressable>;
}

export function MobileVoiceRecorder({chatId,onChange,disabled}:{chatId:string;onChange:(m:MediaAttachment)=>void;disabled?:boolean}) {
  const colors=useColors();
  const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status=useAudioRecorderState(recorder);
  const [busy,setBusy]=useState(false);
  const mounted=useRef(true);
  const timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const finishRef=useRef<()=>Promise<void>>(async()=>{});
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timeout.current)clearTimeout(timeout.current);if(recorder.isRecording)void recorder.stop();void setAudioModeAsync({allowsRecording:false});};},[recorder]);
  async function finish() {
    if(timeout.current)clearTimeout(timeout.current);
    setBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({allowsRecording:false});
      if(!recorder.uri)throw new Error("Recording wasn't saved. Please try again.");
      const mime=Platform.OS==="web"?"audio/webm":"audio/mp4";
      const media=await uploadDeviceMedia(recorder.uri,`voice-note.${Platform.OS==="web"?"webm":"m4a"}`,mime,"chat",chatId);
      if(mounted.current)onChange(media);
    }catch(e){if(mounted.current)Alert.alert("Voice note not saved",e instanceof Error?e.message:"Try again.");}
    finally{if(mounted.current)setBusy(false);}
  }
  finishRef.current=finish;
  async function toggle() {
    if(status.isRecording){await finish();return;}
    setBusy(true);
    try {
      const permission=await requestRecordingPermissionsAsync();
      if(!permission.granted)throw new Error("Microphone permission is needed. Allow it in your device settings to record a voice note.");
      if(!mounted.current)return;
      await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
      await recorder.prepareToRecordAsync();
      if(!mounted.current){await recorder.stop();return;}
      recorder.record();
      timeout.current=setTimeout(()=>void finishRef.current(),180000);
    }catch(e){Alert.alert("Microphone unavailable",e instanceof Error?e.message:"Try again.");}
    finally{if(mounted.current)setBusy(false);}
  }
  return <Pressable accessibilityLabel={status.isRecording?"Stop recording voice note":"Record voice note"} disabled={busy||disabled} onPress={toggle} style={{padding:10,minHeight:44}}>
    {busy?<ActivityIndicator color={colors.primary}/>:<Feather name={status.isRecording?"square":"mic"} size={20} color={status.isRecording?colors.destructive:colors.primary}/>}
    {status.isRecording?<Text style={{color:colors.destructive,fontSize:10}}>{Math.floor(status.durationMillis/1000)}s</Text>:null}
  </Pressable>;
}

function AudioAttachment({uri,headers}:{uri:string;headers:Record<string,string>}) {
  const colors=useColors();
  const source=useMemo(()=>({uri,headers}),[uri,headers]);
  const player=useAudioPlayer(source);
  const status=useAudioPlayerStatus(player);
  return <Pressable accessibilityLabel={status.playing?"Pause voice message":"Play voice message"} onPress={()=>{if(status.playing)player.pause();else{if(status.didJustFinish)void player.seekTo(0);player.play();}}} style={{padding:12,flexDirection:"row",gap:8}}>
    <Feather name={status.playing?"pause":"play"} size={20} color={colors.primary}/><Text style={{color:colors.foreground}}>Voice message · {Math.floor(status.currentTime||0)}s</Text>
  </Pressable>;
}
function VideoAttachment({uri,headers}:{uri:string;headers:Record<string,string>}) {
  const source=useMemo(()=>({uri,headers}),[uri,headers]);
  const player=useVideoPlayer(source);
  return <VideoView player={player} nativeControls style={{width:230,height:180}} contentFit="contain" />;
}
export function MobileMediaPreview({media}:{media:MediaAttachment}) {
  const {getToken}=useAuth();
  const [token,setToken]=useState<string|null>(null);
  const [webUri,setWebUri]=useState<string|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true,objectUrl:string|undefined;setError(false);
    getToken().then(async t=>{
      if(active)setToken(t);
      if(Platform.OS==="web"&&t){
        const response=await fetch(absolute(media.url),{headers:{Authorization:`Bearer ${t}`}});
        if(!response.ok)throw new Error("Media unavailable");
        const blob=await response.blob();if(!active)return;
        objectUrl=URL.createObjectURL(blob);setWebUri(objectUrl);
      }
    }).catch(()=>{if(active)setError(true);});
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[getToken,media.id,media.url]);
  const headers=useMemo(()=>{const result:Record<string,string>={};if(token)result.Authorization=`Bearer ${token}`;return result;},[token]);
  if(error)return <Text>Media unavailable. Reopen this conversation to retry.</Text>;
  if(!token||(Platform.OS==="web"&&!webUri))return <ActivityIndicator accessibilityLabel="Loading private media"/>;
  const uri=Platform.OS==="web"?webUri!:absolute(media.url);
  if(media.contentType.startsWith("image/"))return <Image accessibilityLabel={media.name} source={{uri,headers}} style={{width:230,height:180,borderRadius:12}} resizeMode="contain"/>;
  if(media.contentType.startsWith("video/"))return <VideoAttachment uri={uri} headers={headers}/>;
  return <AudioAttachment uri={uri} headers={headers}/>;
}
