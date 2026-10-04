import type data from "../../../public/landing/data.json";

export type LandingData = typeof data;
export type Frame = LandingData["frames"][number];
