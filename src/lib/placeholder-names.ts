export const ADJECTIVES: readonly string[] = [
  'bouncy',
  'breezy',
  'bubbly',
  'chirpy',
  'clumsy',
  'clunky',
  'creaky',
  'crinkly',
  'crunchy',
  'dazzling',
  'dinky',
  'drippy',
  'flimsy',
  'fluffy',
  'frosty',
  'frothy',
  'fuzzy',
  'giddy',
  'glittery',
  'gloomy',
  'grouchy',
  'grumpy',
  'honking',
  'jazzy',
  'jolly',
  'knobbly',
  'lanky',
  'lofty',
  'loopy',
  'lumpy',
  'majestic',
  'munchy',
  'mushy',
  'noodly',
  'oozy',
  'peppy',
  'perky',
  'plucky',
  'prickly',
  'puffy',
  'quirky',
  'rambling',
  'rusty',
  'scruffy',
  'silky',
  'sleepy',
  'sloppy',
  'snappy',
  'snarky',
  'sneaky',
  'soggy',
  'sparkly',
  'squishy',
  'stubby',
  'tangy',
  'thunderous',
  'toasty',
  'twitchy',
  'uppity',
  'velvety',
  'vivid',
  'wacky',
  'whimsical',
  'wiggly',
  'wobbly',
  'wooly',
  'yawning',
  'zesty',
  'zingy',
  'zippy',
];

export const NOUNS: readonly string[] = [
  'anchovy',
  'bagpipe',
  'biscuit',
  'blobfish',
  'cabbage',
  'cactus',
  'catfish',
  'donut',
  'dumbbell',
  'eggplant',
  'flamingo',
  'gerbil',
  'goblin',
  'hamster',
  'harmonica',
  'icicle',
  'igloo',
  'jawbreaker',
  'jellybean',
  'kazoo',
  'kettle',
  'koala',
  'lantern',
  'llama',
  'lollipop',
  'macaroon',
  'marmot',
  'mittens',
  'muffin',
  'narwhal',
  'nectarine',
  'noodle',
  'opossum',
  'origami',
  'parsnip',
  'pebble',
  'penguin',
  'pickle',
  'platypus',
  'pretzel',
  'quicksand',
  'quokka',
  'raccoon',
  'radish',
  'rhubarb',
  'rutabaga',
  'salamander',
  'scone',
  'snorkel',
  'spatula',
  'teapot',
  'toadstool',
  'toaster',
  'trombone',
  'turnip',
  'ukulele',
  'umbrella',
  'varmint',
  'vessel',
  'waffle',
  'walrus',
  'weasel',
  'wizard',
  'wombat',
  'woodpecker',
  'xylophone',
  'yak',
  'yodel',
  'zeppelin',
  'zucchini',
];

export function generatePlaceholderName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

export function generatePlaceholderNames(count: number): string[] {
  const results: string[] = [];
  const seen = new Set<string>();
  const maxAttempts = (ADJECTIVES.length * NOUNS.length) / 2;
  let attempts = 0;

  while (results.length < count && attempts < maxAttempts) {
    const name = generatePlaceholderName();
    if (!seen.has(name)) {
      seen.add(name);
      results.push(name);
    }
    attempts++;
  }

  // Fallback: if we somehow exhausted unique combinations, fill with indexed names
  while (results.length < count) {
    results.push(`user-${results.length + 1}`);
  }

  return results;
}
