import Deck from "@/components/pitch/Deck";
import data from "../../../public/landing/data.json";

// The 3-minute pitch: full-screen slides built from the landing page's own
// animations (real runs) and the narrated demo video. Public, like the landing page.

export const metadata = {
  title: "asky — pitch",
  description: "Don't ask me. asky. The AI apprentice that captures why experts do what they do — before they retire.",
};

export default function Pitch() {
  return <Deck d={data} />;
}
