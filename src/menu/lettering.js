// Hand-made lettering for the scratching post. Each word is scratched by code
// (scratch.js) until a scan is listed here. To use one, save a PNG with a
// transparent background in assets/lettering/ and change that word's line:
//
//   play: new URL('../../assets/lettering/play.png', import.meta.url).href,
//
// A scan is fitted to the height the scratched word would have, so trim it
// close to the letters. The title is one image for all three lines, and it
// also says where the red dot rests, across and down the image from 0 to 1:
//
//   title: { src: new URL('../../assets/lettering/title.png', import.meta.url).href, dot: [0.42, 0.5] },
export const LETTERING = {
  title: null,
  play: null,
  cards: null,
  help: null,
}
