import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Alert, Animated, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg";
import { useCreateStatus, getListStatusesQueryKey, type MediaAttachment, type Status } from "@workspace/api-client-react";
import { PageFrame, SectionTitle } from "@/components/common";
import { MobileMediaPicker, MobileMediaPreview } from "@/components/Media";
import { useColors } from "@/hooks/useColors";
import { StatusRing, useActiveStatuses } from "@/components/StatusRing";
import { useAppStore } from "@/state/AppStore";

type StatusBackgroundStyle = Status["backgroundStyle"];
const STATUS_GRADIENTS: { id: StatusBackgroundStyle; label: string; colors: [string, string, string] }[] = [
  { id: "midnight", label: "Midnight", colors: ["#18254F", "#394EA2", "#181A3C"] },
  { id: "sunset", label: "Sunset", colors: ["#A73354", "#DA5360", "#672B71"] },
  { id: "berry", label: "Berry", colors: ["#54265E", "#A23B8B", "#3B255E"] },
  { id: "ocean", label: "Ocean", colors: ["#075D73", "#15869A", "#163B73"] },
  { id: "aurora", label: "Aurora", colors: ["#12675F", "#397E9D", "#4C3D90"] },
  { id: "coral", label: "Coral", colors: ["#A43E46", "#D76554", "#713355"] },
  { id: "forest", label: "Forest", colors: ["#145542", "#27765F", "#183F5D"] },
  { id: "plum", label: "Plum", colors: ["#492A70", "#7B3E9A", "#34285F"] },
];
const STORY_DURATION_MS = 5000;

function GradientFill({ style }: { style: StatusBackgroundStyle }) {
  const gradient = STATUS_GRADIENTS.find((item) => item.id === style) ?? STATUS_GRADIENTS[0];
  const gradientId = `status-gradient-${style}`;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={gradient.colors[0]} />
          <Stop offset="55%" stopColor={gradient.colors[1]} />
          <Stop offset="100%" stopColor={gradient.colors[2]} />
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
    </Svg>
  );
}

export default function Stories() {
  const colors=useColors(),router=useRouter(),client=useQueryClient();
  const params=useLocalSearchParams<{authorId?:string;friends?:string}>();
  const authorId=typeof params.authorId==="string"?params.authorId:undefined;
  const friendsMode=params.friends==="1";
  const {profile}=useAppStore();
  const list=useActiveStatuses();
  const create=useCreateStatus();
  const [content,setContent]=useState("");
  const [media,setMedia]=useState<MediaAttachment>();
  const [backgroundStyle,setBackgroundStyle]=useState<StatusBackgroundStyle>("midnight");
  const [notice,setNotice]=useState("");
  const [viewing,setViewing]=useState<{items:Status[];index:number}|null>(null);
  const openedAuthorId=useRef<string|null>(null);
  const openedFriendsQueue=useRef(false);
  const progress=useRef(new Animated.Value(0)).current;
  const storyFade=useRef(new Animated.Value(0)).current;
  const ownStatuses=useMemo(()=>list.active
    .filter(status=>status.author.id===profile?.id)
    .sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()),[list.active,profile?.id]);
  const nextStatus=useCallback(()=>{
    if(!viewing)return;
    if(viewing.index<viewing.items.length-1)setViewing({items:viewing.items,index:viewing.index+1});
    else {setViewing(null);if(friendsMode)router.replace('/(tabs)/chats');else if(authorId)router.back();}
  },[authorId,friendsMode,router,viewing]);
  const previousStatus=useCallback(()=>{
    setViewing((current)=>current?{...current,index:Math.max(0,current.index-1)}:null);
  },[]);
  const closeViewer=useCallback(()=>{
    setViewing(null);
    if(friendsMode)router.replace('/(tabs)/chats');else if(authorId)router.back();
  },[authorId,friendsMode,router]);

  useEffect(()=>{
    if(!friendsMode||!profile?.id||!list.data||openedFriendsQueue.current)return;
    openedFriendsQueue.current=true;
    const byAuthor=new Map<string,Status[]>();
    for(const status of list.active){
      if(status.author.id===profile.id)continue;
      byAuthor.set(status.author.id,[...(byAuthor.get(status.author.id)??[]),status]);
    }
    const queue=Array.from(byAuthor.values())
      .map(items=>items.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()))
      .sort((a,b)=>new Date(b[b.length-1].createdAt).getTime()-new Date(a[a.length-1].createdAt).getTime())
      .flat();
    if(queue.length)setViewing({items:queue,index:0});
  },[friendsMode,profile?.id,list.data,list.active]);

  useEffect(()=>{
    if(friendsMode||!authorId||!profile?.id||openedAuthorId.current===authorId||(!list.data&&!list.isError))return;
    openedAuthorId.current=authorId;
    const items=list.active
      .filter(status=>status.author.id===authorId&&status.author.id!==profile.id)
      .sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
    if(items.length)setViewing({items,index:0});
    else {Alert.alert("Status unavailable","Only active statuses from mutual contacts can be viewed here.");router.back();}
  },[friendsMode,authorId,list.active,list.data,list.isError,profile?.id,router]);
  useEffect(()=>{
    if(!viewing){progress.setValue(0);return;}
    progress.setValue(0);
    const animation=Animated.timing(progress,{toValue:1,duration:STORY_DURATION_MS,useNativeDriver:false});
    animation.start(({finished})=>{if(finished)nextStatus();});
    return()=>animation.stop();
  },[viewing?.index,viewing?.items,nextStatus,progress]);
  useEffect(()=>{
    storyFade.setValue(0);
    Animated.timing(storyFade,{toValue:1,duration:240,useNativeDriver:true}).start();
  },[viewing?.index,storyFade]);
  const activeStatus=viewing?.items[viewing.index];

  async function share() {
    setNotice("");
    try{
      await create.mutateAsync({data:{content:content.trim()||media?.name||"Story",mediaId:media?.id,backgroundStyle:media?"midnight":backgroundStyle}});
      setContent("");setMedia(undefined);setBackgroundStyle("midnight");setNotice("Your status is live for the next 24 hours.");await client.invalidateQueries({queryKey:getListStatusesQueryKey()});
    }catch(e){Alert.alert("Couldn't post story",e instanceof Error?e.message:"Try again.");}
  }
  return <>
    {!friendsMode?<PageFrame>
     <Pressable accessibilityLabel="Back" onPress={()=>router.back()} style={{paddingVertical:12}}><Text style={{color:colors.primary}}>Back</Text></Pressable>
     <Text style={{color:colors.foreground,fontSize:26,fontWeight:"700"}}>Your status</Text>
     <Text style={{color:colors.mutedForeground,marginVertical:8}}>Create and manage your own updates. Shared with mutual contacts for 24 hours.</Text>
    <View style={{borderRadius:22,overflow:"hidden",height:190,marginTop:12,backgroundColor:"#171A2B"}}>
      {media?<MobileMediaPreview media={media}/>:<GradientFill style={backgroundStyle}/>}
      {media?<TextInput accessibilityLabel="Story caption" value={content} onChangeText={setContent} maxLength={500} placeholder="Add a caption…" placeholderTextColor="rgba(255,255,255,0.7)" multiline style={{color:"#fff",backgroundColor:"rgba(8,10,24,0.64)",padding:16,borderRadius:14,minHeight:70,position:"absolute",left:14,right:14,bottom:14}}/>:
        <TextInput accessibilityLabel="Status text" value={content} onChangeText={setContent} maxLength={500} placeholder="What would you like to share?" placeholderTextColor="rgba(255,255,255,0.72)" multiline textAlignVertical="center" style={{color:"#fff",fontSize:25,fontWeight:"700",textAlign:"center",paddingHorizontal:24,paddingVertical:18,flex:1}}/>}
    </View>
    {!media?<>
      <Text style={{color:colors.mutedForeground,fontSize:12,fontWeight:"700",marginTop:16}}>TEXT BACKGROUND</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:12,paddingVertical:10}}>
        {STATUS_GRADIENTS.map((gradient)=><Pressable key={gradient.id} accessibilityRole="radio" accessibilityState={{selected:backgroundStyle===gradient.id}} accessibilityLabel={`${gradient.label} background`} onPress={()=>setBackgroundStyle(gradient.id)} style={{alignItems:"center",gap:5}}>
          <View style={{width:58,height:42,borderRadius:13,overflow:"hidden",borderWidth:backgroundStyle===gradient.id?2:0,borderColor:"#fff"}}><GradientFill style={gradient.id}/></View>
          <Text style={{color:colors.mutedForeground,fontSize:10}}>{gradient.label}</Text>
        </Pressable>)}
      </ScrollView>
    </>:null}
    <View style={{flexDirection:"row",alignItems:"center",marginVertical:10}}>
      <MobileMediaPicker purpose="status" onChange={setMedia} disabled={create.isPending}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Share status for 24 hours" onPress={()=>void share()} disabled={create.isPending||(!content.trim()&&!media)} style={{padding:12,marginLeft:"auto"}}><Text style={{color:colors.primary,fontWeight:"700"}}>{create.isPending?"Sharing…":"Share status"}</Text></Pressable>
    </View>
    {media?<Pressable accessibilityRole="button" accessibilityLabel="Remove attached media" onPress={()=>setMedia(undefined)}><Text style={{color:colors.foreground}}>{media.name} · Remove</Text></Pressable>:null}
    {notice?<Text accessibilityLiveRegion="polite" accessibilityRole="alert" onPress={()=>setNotice("")} style={{color:"#3B82F6",fontWeight:"700",marginBottom:6}}>{notice}</Text>:null}
     <SectionTitle title="Your status updates" />
    {list.isLoading?<Text style={{color:colors.mutedForeground}}>Loading stories…</Text>:null}
    {list.isError?<Pressable onPress={()=>void list.refetch()}><Text style={{color:colors.destructive}}>Couldn't load stories. Tap to retry.</Text></Pressable>:null}
     {!list.isLoading&&list.data&&ownStatuses.length===0?<Text style={{color:colors.mutedForeground}}>Your active updates will appear here, one card per post.</Text>:null}
     {ownStatuses.map(status=>{
       return <Pressable key={status.id} accessibilityRole="button" accessibilityLabel={`View your status posted ${new Date(status.createdAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`} onPress={()=>setViewing({items:[status],index:0})} style={{padding:12,marginVertical:8,borderRadius:18,backgroundColor:colors.card,flexDirection:"row",alignItems:"center",gap:12}}>
        <StatusRing size={74} active stroke={3}>
          <View style={{width:62,height:62,borderRadius:31,overflow:"hidden",justifyContent:"center",alignItems:"center",backgroundColor:"#16192B"}}>
             {status.media?<Text style={{color:"#fff",fontWeight:"700",fontSize:10}}>MEDIA</Text>:<><GradientFill style={status.backgroundStyle}/><Text numberOfLines={2} style={{color:"#fff",textAlign:"center",fontWeight:"700",fontSize:10,padding:5}}>{status.content}</Text></>}
          </View>
        </StatusRing>
        <View style={{flex:1}}>
           <View style={{flexDirection:"row",alignItems:"center",gap:6}}><Text numberOfLines={1} style={{color:colors.foreground,fontWeight:"700",flexShrink:1}}>You · {new Date(status.createdAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</Text><Text style={{color:"#3B82F6",fontSize:10,fontWeight:"800",letterSpacing:1}}>ACTIVE</Text></View>
           <Text numberOfLines={2} style={{color:colors.mutedForeground,marginTop:4}}>{status.content}</Text>
           <Text style={{color:colors.mutedForeground,fontSize:11,marginTop:5}}>Expires {new Date(status.expiresAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</Text>
        </View>
        <Text style={{color:colors.primary,fontSize:18,fontWeight:"700"}}>›</Text>
      </Pressable>;
    })}
    </PageFrame>:null}
      <Modal visible={!!viewing||friendsMode} animationType="fade" onRequestClose={closeViewer} statusBarTranslucent>
      {activeStatus&&viewing?<View style={{flex:1,backgroundColor:"#101321"}}>
        <StatusBar hidden/>
        <GradientFill style={activeStatus.backgroundStyle}/>
        <View style={{paddingTop:18,paddingHorizontal:14}}>
          <View accessibilityLabel={`Status ${viewing.index+1} of ${viewing.items.length}`} style={{flexDirection:"row",gap:4,marginBottom:16}}>
            {viewing.items.map((item,index)=><View key={item.id} style={{flex:1,height:3,backgroundColor:"rgba(255,255,255,0.32)",borderRadius:9,overflow:"hidden"}}>
              <Animated.View style={{height:"100%",width:index<viewing.index?"100%":index===viewing.index?progress.interpolate({inputRange:[0,1],outputRange:["0%","100%"]}):"0%",backgroundColor:"#fff",borderRadius:9}}/>
            </View>)}
          </View>
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
            <View style={{flex:1}}>
              <Text style={{color:"#fff",fontSize:15,fontWeight:"700"}}>{activeStatus.author.name}</Text>
              <Text style={{color:"rgba(255,255,255,0.72)",fontSize:12,marginTop:3}}>{new Date(activeStatus.createdAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</Text>
            </View>
             <Pressable accessibilityRole="button" accessibilityLabel="Close status viewer" onPress={closeViewer} hitSlop={12} style={{padding:8}}>
              <Text style={{color:"#fff",fontSize:22,fontWeight:"600"}}>×</Text>
            </Pressable>
          </View>
        </View>
        <Animated.View style={{flex:1,alignItems:"center",justifyContent:"center",paddingHorizontal:20,paddingVertical:24,opacity:storyFade}}>
          {activeStatus.media?<MobileMediaPreview media={activeStatus.media} fullScreen/>:
            <Text accessibilityLabel={`Status text: ${activeStatus.content}`} style={{color:"#fff",fontSize:31,lineHeight:40,textAlign:"center",fontWeight:"700",paddingHorizontal:12}}>{activeStatus.content}</Text>}
        </Animated.View>
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={{flex:1,flexDirection:"row",paddingTop:100}}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous status" onPress={previousStatus} style={{width:"28%"}}/>
            <View pointerEvents="none" style={{flex:1}}/>
            <Pressable accessibilityRole="button" accessibilityLabel="Next status" onPress={nextStatus} style={{width:"28%"}}/>
          </View>
        </View>
       </View>:friendsMode?<View style={{flex:1,backgroundColor:"#101321",alignItems:"center",justifyContent:"center",padding:28}}>
         <StatusBar hidden/>
         <Feather name="circle" size={38} color="rgba(255,255,255,0.72)"/>
         <Text style={{color:"#fff",fontSize:21,fontWeight:"700",textAlign:"center",marginTop:18}}>No friends’ statuses right now</Text>
         <Text style={{color:"rgba(255,255,255,0.68)",textAlign:"center",marginTop:8,lineHeight:21}}>Mutual contacts’ updates will play here one after another.</Text>
         {list.isLoading?<Text style={{color:"rgba(255,255,255,0.7)",marginTop:18}}>Loading statuses…</Text>:null}
         <Pressable accessibilityRole="button" accessibilityLabel="Back to Chats" onPress={closeViewer} style={{padding:14,marginTop:18}}><Text style={{color:"#66D9FF",fontWeight:"700"}}>Back to Chats</Text></Pressable>
       </View>:null}
    </Modal>
   </>;
}
