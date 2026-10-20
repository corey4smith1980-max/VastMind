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

export const TONEABLE_EMOJI = new Set(["👋","✋","👌","🤌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","👍","👎","✊","👊","👏","🙌","🙏","💪"]);
export const SKIN_TONES = ["🏻","🏼","🏽","🏾","🏿"];
