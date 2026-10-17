/* Push-only service worker. Never caches private pages, API responses, or media. */
self.addEventListener("push",event=>{
  // Do not use client-controlled URLs or expose message bodies on lock screens.
  event.waitUntil(self.registration.showNotification("VastMind",{
    body:"You have new activity. Open the app to view it.",
    icon:new URL("icon-192.png",self.registration.scope).href,
    tag:"iam-activity",
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL("notifications",self.registration.scope).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const existing=windows.find(w=>w.url.startsWith(self.registration.scope));
    if(existing){await existing.navigate(url);return existing.focus();}
    return self.clients.openWindow(url);
  })());
});
self.addEventListener("pushsubscriptionchange",event=>{
  // A fresh subscription needs authenticated registration. Show no private data
  // and ask the member to re-enable through Settings on their next visit.
  event.waitUntil(Promise.resolve());
});
