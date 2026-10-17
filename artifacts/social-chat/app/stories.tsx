import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useListStatuses, useCreateStatus, getListStatusesQueryKey, type MediaAttachment } from "@workspace/api-client-react";
import { PageFrame, SectionTitle } from "@/components/common";
import { MobileMediaPicker, MobileMediaPreview } from "@/components/Media";
import { useColors } from "@/hooks/useColors";

export default function Stories() {
  const colors=useColors(),router=useRouter(),client=useQueryClient();
  const list=useListStatuses({query:{queryKey:getListStatusesQueryKey(),refetchInterval:30000}});
  const create=useCreateStatus();
  const [content,setContent]=useState("");
  const [media,setMedia]=useState<MediaAttachment>();
  async function share() {
    try{
      await create.mutateAsync({data:{content:content.trim()||media?.name||"Story",mediaId:media?.id}});
      setContent("");setMedia(undefined);await client.invalidateQueries({queryKey:getListStatusesQueryKey()});
    }catch(e){Alert.alert("Couldn't post story",e instanceof Error?e.message:"Try again.");}
  }
  return <PageFrame>
    <Pressable accessibilityLabel="Back" onPress={()=>router.back()} style={{paddingVertical:12}}><Text style={{color:colors.primary}}>Back</Text></Pressable>
    <Text style={{color:colors.foreground,fontSize:26,fontWeight:"700"}}>Stories</Text>
    <Text style={{color:colors.mutedForeground,marginVertical:8}}>Photos, videos and thoughts, available for 24 hours.</Text>
    <TextInput accessibilityLabel="Story caption" value={content} onChangeText={setContent} maxLength={500} placeholder="Share something about today…" placeholderTextColor={colors.mutedForeground} multiline style={{color:colors.foreground,backgroundColor:colors.card,padding:16,borderRadius:16,minHeight:80}}/>
    <View style={{flexDirection:"row",alignItems:"center",marginVertical:10}}>
      <MobileMediaPicker purpose="status" onChange={setMedia} disabled={create.isPending}/>
      <Pressable onPress={()=>void share()} disabled={create.isPending||(!content.trim()&&!media)} style={{padding:12}}><Text style={{color:colors.primary,fontWeight:"700"}}>{create.isPending?"Sharing…":"Share for 24h"}</Text></Pressable>
    </View>
    {media?<Pressable onPress={()=>setMedia(undefined)}><Text style={{color:colors.foreground}}>{media.name} · Remove</Text></Pressable>:null}
    {list.isLoading?<Text style={{color:colors.mutedForeground}}>Loading stories…</Text>:null}
    {list.isError?<Pressable onPress={()=>void list.refetch()}><Text style={{color:colors.destructive}}>Couldn't load stories. Tap to retry.</Text></Pressable>:null}
    {!list.isLoading&&list.data?.length===0?<Text style={{color:colors.mutedForeground}}>No stories right now. Be the first to share.</Text>:null}
    {list.data?.map(story=><View key={story.id} style={{padding:16,marginVertical:10,borderRadius:16,backgroundColor:colors.card}}>
      <Text style={{color:colors.foreground,fontWeight:"700",marginBottom:8}}>{story.author.name}</Text>
      {story.media?<MobileMediaPreview media={story.media}/>:null}
      <Text style={{color:colors.foreground,marginVertical:8}}>{story.content}</Text>
      <Text style={{color:colors.mutedForeground,fontSize:12}}>Expires {new Date(story.expiresAt).toLocaleString()}</Text>
    </View>)}
  </PageFrame>;
}
