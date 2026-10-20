export type EmojiCategory = "faces" | "people" | "animals" | "food" | "activity" | "travel" | "objects" | "symbols" | "flags";
export type EmojiEntry = { symbol: string; label: string; category: EmojiCategory };
type Pair = readonly [string, string];

function group(category: EmojiCategory, pairs: readonly Pair[]): EmojiEntry[] {
  return pairs.map(([symbol, label]) => ({ symbol, label, category }));
}

// Unicode emoji keeps the picker lightweight and avoids bundling licensed artwork.
export const EMOJI: EmojiEntry[] = [
  ...group("faces", [
    ["😀","Grinning face"],["😃","Big smile"],["😄","Smile with eyes"],["😁","Beaming"],["😆","Laughing"],["😅","Sweat smile"],["😂","Tears of joy"],["🤣","Rolling laugh"],["🥹","Holding back tears"],["😊","Blush"],["😇","Halo"],["🙂","Slight smile"],["🙃","Upside down"],["😉","Wink"],["😍","Heart eyes"],["🥰","Smiling hearts"],["😘","Kiss"],["😗","Kissing"],["😋","Yum"],["😛","Tongue out"],["🤪","Silly"],["😜","Wink tongue"],["🤗","Hug"],["🤭","Hand over mouth"],["🫢","Gasp"],["🤫","Shh"],["🤔","Thinking"],["🫡","Salute"],["🤐","Zipped mouth"],["🤨","Raised brow"],["😐","Neutral"],["😶","No words"],["😏","Smirk"],["😒","Unamused"],["🙄","Eye roll"],["😬","Grimace"],["😮‍💨","Sigh"],["🤥","Lying"],["😌","Relieved"],["😔","Pensive"],["🥺","Pleading"],["😢","Crying"],["😭","Loudly crying"],["😤","Steam"],["😠","Angry"],["🤯","Mind blown"],["🥳","Party face"],["😎","Cool"],["🤓","Nerd"],["🧐","Monocle"],["😴","Sleepy"],["🤤","Drooling"],["🥶","Cold"],["🥵","Hot"],["🤧","Sneezing"],["🤒","Sick"],["🤕","Hurt"],["💀","Skull"],["👻","Ghost"],["🤖","Robot"],
  ]),
  ...group("people", [
    ["👋","Wave"],["🤚","Raised back hand"],["🖐️","Hand"],["✋","Stop"],["🫱","Right hand"],["🫲","Left hand"],["👌","OK"],["🤌","Pinched fingers"],["✌️","Peace"],["🤞","Fingers crossed"],["🤟","Love you"],["🤘","Rock on"],["🤙","Call me"],["👈","Point left"],["👉","Point right"],["👆","Point up"],["👇","Point down"],["👍","Thumbs up"],["👎","Thumbs down"],["✊","Fist"],["👊","Fist bump"],["👏","Clap"],["🙌","Celebrate"],["🫶","Heart hands"],["🙏","Thank you"],["💪","Strong"],["🦾","Bionic arm"],["🧑","Person"],["👩","Woman"],["👨","Man"],["🧑‍💻","Technologist"],["👩‍💻","Woman technologist"],["👨‍💻","Man technologist"],["👩‍🎨","Artist"],["👨‍🍳","Cook"],["👶","Baby"],["🧒","Child"],["👵","Older woman"],["👴","Older man"],["🧑‍🤝‍🧑","People holding hands"],["💃","Dance"],["🕺","Dancer"],["🧘","Meditate"],["🧑‍🚀","Astronaut"],["🧑‍⚕️","Health worker"],["🧑‍🏫","Teacher"],["🧑‍🎓","Student"],
  ]),
  ...group("animals", [
    ["🐶","Dog"],["🐱","Cat"],["🐭","Mouse"],["🐹","Hamster"],["🐰","Rabbit"],["🦊","Fox"],["🐻","Bear"],["🐼","Panda"],["🐨","Koala"],["🐯","Tiger"],["🦁","Lion"],["🐮","Cow"],["🐷","Pig"],["🐸","Frog"],["🐵","Monkey"],["🐔","Chicken"],["🐧","Penguin"],["🐦","Bird"],["🦆","Duck"],["🦉","Owl"],["🦋","Butterfly"],["🐢","Turtle"],["🐍","Snake"],["🐙","Octopus"],["🦀","Crab"],["🐬","Dolphin"],["🐳","Whale"],["🦄","Unicorn"],["🐝","Bee"],["🐞","Ladybug"],["🐾","Paw prints"],["🌵","Cactus"],["🌸","Blossom"],["🌻","Sunflower"],["🌈","Rainbow"],["🌙","Moon"],["⭐","Star"],["🔥","Fire"],["🌊","Wave"],["🍀","Four-leaf clover"],
  ]),
  ...group("food", [
    ["🍎","Apple"],["🍊","Orange"],["🍋","Lemon"],["🍉","Watermelon"],["🍇","Grapes"],["🍓","Strawberry"],["🫐","Blueberries"],["🍒","Cherries"],["🍑","Peach"],["🥑","Avocado"],["🍕","Pizza"],["🍔","Burger"],["🍟","Fries"],["🌮","Taco"],["🍣","Sushi"],["🍜","Noodles"],["🍩","Doughnut"],["🎂","Birthday cake"],["🍪","Cookie"],["🍫","Chocolate"],["🍿","Popcorn"],["☕","Coffee"],["🧋","Bubble tea"],["🍵","Tea"],["🥤","Drink"],["🍺","Beer"],["🍷","Wine"],["🥂","Cheers"],["🍽️","Meal"],["🧀","Cheese"],
  ]),
  ...group("activity", [
    ["⚽","Soccer"],["🏀","Basketball"],["🏈","Football"],["⚾","Baseball"],["🎾","Tennis"],["🏐","Volleyball"],["🏓","Ping pong"],["🥊","Boxing"],["🏆","Trophy"],["🥇","Gold medal"],["🎯","Target"],["🎮","Video game"],["🎲","Dice"],["🎸","Guitar"],["🎹","Piano"],["🎤","Microphone"],["🎧","Headphones"],["🎨","Art"],["🎬","Movie"],["🎟️","Ticket"],["🎉","Party popper"],["🎊","Confetti"],["🎁","Gift"],["🎈","Balloon"],["🪩","Disco ball"],["🏋️","Weight lifting"],["🚴","Cycling"],["🏃","Running"],["🧩","Puzzle"],
  ]),
  ...group("travel", [
    ["🚗","Car"],["🚕","Taxi"],["🚌","Bus"],["🚆","Train"],["✈️","Airplane"],["🚀","Rocket"],["🚲","Bicycle"],["🛵","Scooter"],["🚢","Ship"],["🏠","Home"],["🏢","Office"],["🏖️","Beach"],["🏕️","Camping"],["🗺️","Map"],["🧭","Compass"],["🌍","Earth"],["🌃","Night city"],["☀️","Sun"],["🌧️","Rain"],["❄️","Snow"],["⛅","Cloudy"],["🌪️","Storm"],["🌋","Volcano"],["🏝️","Island"],["🛣️","Road"],["🧳","Luggage"],["🛟","Life ring"],["🚦","Traffic light"],["🕰️","Clock"],["🏰","Castle"],
  ]),
  ...group("objects", [
    ["💡","Idea"],["📱","Phone"],["💻","Laptop"],["⌨️","Keyboard"],["🖥️","Monitor"],["📷","Camera"],["🎥","Video camera"],["🔋","Battery"],["🔌","Plug"],["🧸","Teddy bear"],["📚","Books"],["✏️","Pencil"],["📝","Memo"],["📌","Pin"],["🔑","Key"],["🔒","Lock"],["💼","Briefcase"],["🛍️","Shopping bags"],["💳","Credit card"],["💵","Cash"],["📦","Package"],["🪴","Plant"],["🕯️","Candle"],["🧹","Broom"],["🧴","Lotion"],["🧼","Soap"],["🪥","Toothbrush"],["🧻","Paper roll"],["🛏️","Bed"],["🪑","Chair"],
  ]),
  ...group("symbols", [
    ["❤️","Red heart"],["🧡","Orange heart"],["💛","Yellow heart"],["💚","Green heart"],["💙","Blue heart"],["💜","Purple heart"],["🖤","Black heart"],["🤍","White heart"],["🤎","Brown heart"],["💔","Broken heart"],["💕","Two hearts"],["💖","Sparkling heart"],["💯","Hundred"],["✅","Check"],["❌","Cross"],["⚠️","Warning"],["❓","Question"],["❗","Exclamation"],["✨","Sparkles"],["💫","Dizzy"],["💥","Collision"],["💬","Speech bubble"],["💭","Thought bubble"],["🔔","Bell"],["🔕","Muted bell"],["♻️","Recycle"],["🔴","Red circle"],["🟢","Green circle"],["🟡","Yellow circle"],["🔵","Blue circle"],
  ]),
  ...group("flags", [
    ["🇺🇸","United States"],["🇬🇧","United Kingdom"],["🇳🇬","Nigeria"],["🇨🇦","Canada"],["🇦🇺","Australia"],["🇮🇳","India"],["🇿🇦","South Africa"],["🇰🇪","Kenya"],["🇬🇭","Ghana"],["🇯🇵","Japan"],["🇰🇷","South Korea"],["🇧🇷","Brazil"],["🇫🇷","France"],["🇩🇪","Germany"],["🇮🇹","Italy"],["🇪🇸","Spain"],["🇲🇽","Mexico"],["🇦🇪","United Arab Emirates"],["🇸🇦","Saudi Arabia"],["🇺🇦","Ukraine"],
  ]),
];

export const EMOJI_CATEGORIES: { id: EmojiCategory | "recent" | "favorites"; label: string; icon: string }[] = [
  {id:"recent",label:"Recent",icon:"🕘"},{id:"favorites",label:"Favorites",icon:"⭐"},
  {id:"faces",label:"Faces",icon:"😊"},{id:"people",label:"People",icon:"👋"},
  {id:"animals",label:"Nature",icon:"🐻"},{id:"food",label:"Food",icon:"🍕"},
  {id:"activity",label:"Activity",icon:"⚽"},{id:"travel",label:"Travel",icon:"🚗"},
  {id:"objects",label:"Objects",icon:"💡"},{id:"symbols",label:"Symbols",icon:"❤️"},{id:"flags",label:"Flags",icon:"🇳🇬"},
];

export const EMOJI_STICKERS = [
  {name:"Good vibes",items:["🥰","✨","🌈","🫶","🌻","💫","😊","🎉","💖","🦄","🥳","⭐"]},
  {name:"Reactions",items:["👍","👏","🙏","😂","🤔","😮","😢","🔥","💯","✅","❤️","🤝"]},
  {name:"Everyday",items:["☕","🍕","🧋","🐱","🐶","🌙","🎧","📚","🪴","🚀","🎁","👋"]},
];

/** The 35 bundled VastMind originals are sent as sticker tokens across web and mobile. */
export const VASTMIND_STICKERS = [
  { token: "vm_01_happy", label: "Happy", file: "VastMind_01_happy.png" },
  { token: "vm_02_laugh", label: "Laugh", file: "VastMind_02_laugh.png" },
  { token: "vm_03_wink", label: "Wink", file: "VastMind_03_wink.png" },
  { token: "vm_04_love", label: "Love", file: "VastMind_04_love.png" },
  { token: "vm_05_sad", label: "Sad", file: "VastMind_05_sad.png" },
  { token: "vm_06_cry", label: "Crying", file: "VastMind_06_cry.png" },
  { token: "vm_07_surprised", label: "Surprised", file: "VastMind_07_surprised.png" },
  { token: "vm_08_cool", label: "Cool", file: "VastMind_08_cool.png" },
  { token: "vm_09_sleepy", label: "Sleepy", file: "VastMind_09_sleepy.png" },
  { token: "vm_10_thinking", label: "Thinking", file: "VastMind_10_thinking.png" },
  { token: "vm_11_blush", label: "Blush", file: "VastMind_11_blush.png" },
  { token: "vm_12_starstruck", label: "Starstruck", file: "VastMind_12_starstruck.png" },
  { token: "vm_13_kiss", label: "Kiss", file: "VastMind_13_kiss.png" },
  { token: "vm_14_neutral", label: "Neutral", file: "VastMind_14_neutral.png" },
  { token: "vm_15_nervous", label: "Nervous", file: "VastMind_15_nervous.png" },
  { token: "vm_16_angry", label: "Angry", file: "VastMind_16_angry.png" },
  { token: "vm_17_ai_robot", label: "AI robot", file: "VastMind_17_ai_robot.png" },
  { token: "vm_18_cold", label: "Cold", file: "VastMind_18_cold.png" },
  { token: "vm_19_hot", label: "Hot", file: "VastMind_19_hot.png" },
  { token: "vm_20_party", label: "Party", file: "VastMind_20_party.png" },
  { token: "vm_21_vip", label: "VIP", file: "VastMind_21_vip.png" },
  { token: "vm_22_verified", label: "Verified", file: "VastMind_22_verified.png" },
  { token: "vm_23_online", label: "Online", file: "VastMind_23_online.png" },
  { token: "vm_24_notification", label: "Notification", file: "VastMind_24_notification.png" },
  { token: "vm_25_typing", label: "Typing", file: "VastMind_25_typing.png" },
  { token: "vm_26_logo_vastmind", label: "VastMind", file: "VastMind_26_logo_vastmind.png" },
  { token: "vm_27_logo_sparkle", label: "VastMind sparkle", file: "VastMind_27_logo_sparkle.png" },
  { token: "vm_28_logo_love", label: "VastMind love", file: "VastMind_28_logo_love.png" },
  { token: "vm_29_logo_pink", label: "VastMind pink", file: "VastMind_29_logo_pink.png" },
  { token: "vm_30_logo_green", label: "VastMind green", file: "VastMind_30_logo_green.png" },
  { token: "vm_31_logo_gold", label: "VastMind gold", file: "VastMind_31_logo_gold.png" },
  { token: "vm_32_logo_round_badge", label: "VastMind round badge", file: "VastMind_32_logo_round_badge.png" },
  { token: "vm_33_logo_app_icon", label: "VastMind app icon", file: "VastMind_33_logo_app_icon.png" },
  { token: "vm_34_logo_new_message", label: "VastMind new message", file: "VastMind_34_logo_new_message.png" },
  { token: "vm_35_logo_verified", label: "VastMind verified", file: "VastMind_35_logo_verified.png" },
] as const;

export const TONEABLE_EMOJI = new Set(["👋","✋","👌","🤌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","👍","👎","✊","👊","👏","🙌","🙏","💪"]);
export const SKIN_TONES = ["🏻","🏼","🏽","🏾","🏿"];
