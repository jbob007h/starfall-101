// Pre-rendered trance soundtracks (rendered offline by music_styles/trance_game.py, Opus loops in assets/music/).
import type { StreamTrack } from "./stream";
import T1 from "./trance1.json";
import T2 from "./trance2.json";
export const TRANCE1: StreamTrack = T1 as StreamTrack;
export const TRANCE2: StreamTrack = T2 as StreamTrack;
