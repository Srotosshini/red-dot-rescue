// Every word the player reads, in one place. The menu's words come first,
// exactly as written for it. Everything marked TODO copy was moved here from
// around the game and only lowercased and tidied to the copy rules (no extra
// exclamation marks, no em dashes, nothing banned): it is waiting to be
// rewritten. A few entries are small functions, for lines with a number or
// a name in them.
export const strings = {
  title: "Red Dot Rescue",
  tagline: "Storm's coming. They're all still outside.",
  menu: { play: "play", cards: "cards", help: "how?" },
  settings: { sound: "sound", music: "music", pretty: "pretty mode" },
  help: [
    "they follow the red dot.",
    "mostly.",
    "get them in the basket before the rain.",
  ],
  cards: { title: "adopted so far", empty: "nobody yet. go get them." },

  // printed on the menu's cardboard box (the brief asks for the first); the
  // second is an old marker note on its side, crossed out. TODO copy
  box: { up: "THIS SIDE UP", scribble: "mugs" },

  // TODO copy: labels only a screen reader speaks
  a11y: { menu: "menu", settings: "settings", back: "back" },

  // TODO copy: the printed form on the back of each corkboard photo
  form: {
    name: "name",
    coat: "coat",
    eyes: "eyes",
    personality: "personality",
    loves: "loves",
    fears: "afraid of",
    talent: "talent",
    from: "rescued from",
    adopted: "adopted",
  },

  // TODO copy: the five rescues
  levels: {
    backyard: {
      name: "backyard",
      blurb: "storm clouds are rolling over the garden, and six kittens are still out playing.",
      idea: "lead kittens with the dot. boxes and naps get in the way.",
    },
    rooftops: {
      name: "rooftops in the rain",
      blurb: "three wet roofs, two gaps, and a wind that keeps changing its mind.",
      idea: "shy and chaotic kittens. puddles, planks, gusts and a box on a pulley.",
    },
    kitchen: {
      name: "kitchen at midnight",
      blurb: "everyone is asleep except eight kittens and one very busy robot vacuum.",
      idea: "greedy kittens, a vacuum you can ride, and a cup that wants to fall.",
    },
    drain: {
      name: "storm drain",
      blurb: "down where the rain goes. it is dark, and the dot is the only light you have.",
      idea: "darkness. follow the meows and the glinting eyes. boxes float.",
    },
    shelter: {
      name: "shelter finale",
      blurb: "the yard is flooding and the shelter door is open. twelve kittens, every kind of trouble.",
      idea: "every trait at once, and the water is rising. floating boxes become boats.",
    },
  },

  // TODO copy: the kinds of kitten
  traits: {
    plain: {
      name: "curious",
      blurb: "chases the dot wherever it goes.",
      tip: "curious kittens follow the dot. lead them home.",
    },
    shy: {
      name: "shy",
      blurb: "keeps its distance and only creeps forward when the dot is far away.",
      tip: "shy kittens keep their distance. shine the dot past them, then further on. near the basket they walk in by themselves.",
    },
    greedy: {
      name: "greedy",
      blurb: "drops everything for food, including you.",
      tip: "greedy kittens run to any food they see. the bowl by the basket works on them too.",
    },
    chaotic: {
      name: "chaotic",
      blurb: "overshoots the dot and pounces at nothing.",
      tip: "chaotic kittens pounce past the dot. give them room.",
    },
    sleepy: {
      name: "sleepy",
      blurb: "naps whenever the dot stops moving.",
      tip: "sleepy kittens nap when the dot stops. wiggle the dot on one to wake it.",
    },
  },

  // TODO copy: what is said during a rescue
  play: {
    move: { mouse: "move your pointer", touch: "drag your finger" },
    start: {
      backyard: (move) => `you are the laser pointer. ${move} to shine the dot, then lead the kittens to the basket on the deck.`,
      rooftops: () => "watch out for puddles and gusts. the box on the clothesline carries kittens across the big gap.",
      kitchen: () => "the basket is behind the baby gate, and the gate is shut. look at what is balanced on the edge of the island.",
      drain: () => "it is dark down here. kittens’ eyes catch the laser light, and hidden ones meow louder as the dot gets close.",
      shelter: () => "the yard is going to flood. get kittens up onto the walkways and the porch before the water rises.",
    },
    tips: {
      lead: "kittens chase the dot. lead them into the basket.",
      box: "kittens cannot resist a box. hold the dot on the box to call one out.",
      ride: "that box moves. call the kitten out once it reaches the other side.",
      vacuumRide: "a kitten is riding the vacuum. call it out of the box when it gets somewhere useful.",
      hidden: "hear that? someone is hiding. bring the dot close: the meows get louder the nearer it gets.",
      found: "found one.",
      puddle: "kittens will not set a paw in a puddle. lead them around it.",
      butterfly: "everyone freezes for a butterfly. wiggle the dot on a kitten to snap it out of it.",
      moth: "the moth by the lamp is hypnotic. wiggle the dot on a staring kitten to break the spell.",
      wind: "gust coming. kittens out in the open get pushed. behind a chimney or a wall they are safe.",
      vacuum: "the vacuum is terrifying. but put the dot on the box on top of it, and a kitten will hop on for a ride.",
      cup: "that gate has a pedal. something knocked off the island would land right on it.",
      swat: "cats will knock anything off an edge.",
      swim: "a kitten is swimming. it will paddle for the nearest dry spot.",
      boats: "the boxes are floating. kittens sitting in them drift with the water.",
      flood: "the water is rising. the raised walkways and the porch stay dry.",
      storm: "the storm is almost here.",
    },
    home: (name) => `${name} is home`,
    safe: (name, home, total) => `${name} is safe. ${home} of ${total} home.`,
    enough: "that is enough to pass. every extra kitten earns another star.",
    gate: "the gate swung open. now lead them through.",
  },

  // TODO copy: the heads-up display
  hud: {
    home: "home",
    need: (n) => `need ${n}`,
    enough: "enough to pass",
    storm: "storm",
    stormLabel: "time until the storm hits",
    gust: "gust",
    pause: "pause",
  },

  // TODO copy: the level list, the start of a rescue, pause and results
  screens: {
    levels: {
      title: "choose a rescue",
      back: "back",
      best: (best, total) => `best: ${best} of ${total} home`,
      count: (total) => `${total} kittens`,
      locked: "finish the last rescue to unlock",
    },
    intro: {
      kicker: (n, of) => `rescue ${n} of ${of}`,
      goal: (need, total, time) => `bring at least ${need} of ${total} kittens home in ${time}.`,
      start: "start the rescue",
      levels: "levels",
    },
    pause: {
      title: "paused",
      resume: "keep going",
      restart: "restart this rescue",
      levels: "choose another rescue",
      menu: "menu",
      // moved here from the old how-to page
      controls: "right-drag or two fingers to tilt the view, the wheel or a pinch to zoom, q and e to turn. arrow keys move the dot, escape pauses.",
    },
    results: {
      allTitle: "everyone is home!",
      passTitle: "home and dry",
      failTitle: "the storm hit",
      allKicker: "every kitten home",
      passKicker: "rescue complete",
      failKicker: "not enough kittens home",
      rescued: (n, total) => `${n} of ${total} kittens rescued`,
      spare: (time) => ` with ${time} to spare`,
      need: (n) => ` you need ${n} to pass.`,
      unlocked: "new rescue unlocked.",
      newCards: "new adoption cards",
      noCards: "no kittens made it this time, so no cards. they are waiting for you.",
      next: "next rescue",
      again: "play again",
      retry: "try again",
      levels: "levels",
    },
  },

  // TODO copy: the words a kitten's card is made of. Names, loves, fears and
  // talents are picked by number, so keep the lists the same length and order
  // or saved kittens change.
  kittens: {
    coats: {
      ginger: "ginger", cream: "cream", grey: "grey", black: "black",
      brown: "brown", white: "white", chocolate: "chocolate", silver: "silver",
    },
    eyes: ["green", "amber", "copper", "gold", "hazel", "blue"],
    oddEyes: "odd, one blue and one amber",
    patterns: {
      tabby: (coat) => `${coat} tabby`,
      tuxedo: "tuxedo",
      colouredTuxedo: (coat) => `${coat} tuxedo`,
      calico: "calico",
      tortie: "tortoiseshell",
      seal: "seal colorpoint",
      blue: "blue colorpoint",
      bicolor: (coat) => `${coat} and white`,
      spotted: (coat) => `spotted ${coat}`,
    },
    names: [
      "Mochi", "Biscuit", "Pepper", "Noodle", "Tofu", "Pickle", "Waffles", "Bean", "Sprout", "Clementine",
      "Pumpkin", "Dumpling", "Miso", "Olive", "Marble", "Socks", "Pixel", "Nugget", "Juniper", "Toast",
      "Button", "Fig", "Wasabi", "Comet", "Tater", "Peanut", "Sesame", "Ziggy", "Hazel", "Pudding",
      "Basil", "Maple", "Ollie", "Luna", "Kiwi", "Ravioli", "Gnocchi", "Bao", "Crumpet", "Muffin",
      "Scone", "Toffee", "Poppy", "Chai", "Cocoa", "Taco", "Pretzel", "Sardine", "Moth", "Velcro",
      "Puddle", "Bramble", "Tinsel", "Custard", "Dorito", "Gremlin", "Pebble", "Sock Puppet", "Turnip", "Wobble",
      "Lentil", "Snickerdoodle", "Admiral", "Professor", "Bug", "Cricket", "Pistachio", "Kumquat", "Mango", "Radish",
      "Inkblot", "Flapjack", "Sushi", "Tamale", "Hiccup", "Zucchini", "Beans", "Nacho", "Plum", "Rascal",
    ],
    loves: [
      "cardboard boxes", "sunbeams", "the sound of a can opening", "yarn it is not allowed to have", "bottle caps",
      "sitting on homework", "warm laundry", "the top of the fridge", "paper bags", "shoelaces", "boxes too small for it",
      "chasing its own tail", "being carried like a baby", "crinkly wrappers", "the bathroom tap", "bread",
    ],
    fears: [
      "the vacuum", "cucumbers", "its own reflection", "the doorbell", "balloons", "tin foil", "tuesdays",
      "the hairdryer", "sneezes", "an empty bowl", "the blender", "umbrellas opening",
    ],
    talents: [
      "opening cupboards", "knocking things off tables, precisely", "loafing for hours", "yelling at birds",
      "finding the one warm spot", "fitting through tiny gaps", "purring on command", "stealing socks",
      "turning off laptops", "fetching hair ties", "sleeping in impossible positions", "judging you silently",
    ],
  },

  // TODO copy: the rest
  system: {
    noWebgl: "Red Dot Rescue needs WebGL, and this browser could not start it.",
    effectsLow: "effects turned down to keep things smooth.",
    effectsSome: "some effects turned down to keep things smooth.",
    canvas: "Red Dot Rescue: a diorama of kittens chasing a red laser dot",
    photo: (name, label) => `${name}, a ${label} kitten`,
  },
};
