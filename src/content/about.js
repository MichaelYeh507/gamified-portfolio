/**
 * Prose blocks for the AboutArea. Pure data.
 *
 * This is the part no amount of engine hides, and all three reference sites have
 * genuinely good writing. Left empty deliberately rather than filled with
 * placeholder text — a lorem-ipsum about page has a way of shipping.
 *
 * STATUS: written 2026-09-01, then mostly RETIRED 2026-09-02, each cut
 * Michael's: a three-paragraph draft became two lines ("it can just be
 * like major, name, junior"), and the two lines' standing cards were cut
 * the day after ("the reference author had letters of the reference's name the reference author can run over, and thats
 * it"). What ships is the reference's design exactly: the landing's ten drivable
 * letters plus one ground sentence. `name` drives the letters; `tagline`
 * remains for the OG description; `blocks` and `availability` are kept as
 * data with no in-world surface — the DOM card layer renders blocks if an
 * about ever earns its way back.
 */

export default {
  /**
   * The name on the ground at spawn — identity, not prose, which is why it is
   * filled while everything below stays deliberately empty. The LandingArea
   * paints it where the reference's paints "the reference author".
   */
  name: 'Michael Yeh',

  /**
   * One sentence. Shown on approach, and used as the OG description.
   *
   * NOTE: filling this also changes the LANDING - the decal under the name
   * at spawn falls back to "drive around my work" only while this is empty
   * (`LandingArea.FALLBACK_TAGLINE`). If Michael prefers the drive line at
   * spawn, the one-line fix is LandingArea using the fallback string always
   * and this tagline serving the about card and the OG tag only.
   */
  tagline: 'I build software that shows its work.',

  /**
   * The real text, in blocks. Each block is a paragraph; the card renders them
   * in order. Two or three is usually right — this is a personal site, not a CV.
   */
  /**
   * Deliberately tiny, on Michael's call (1 Sep: "i dont think it needs to
   * be this detailed as those information can be found as they drive
   * around"): the island already tells the whole story, so the about says
   * who is driving you around and gets out of the way.
   */
  blocks: [
    'I am Michael Yeh, a junior at Carnegie Mellon studying Information Systems and Artificial Intelligence.',

    'Everything else is out there on the island. Enjoy the drive!',
  ],

  /**
   * Optional: what you are looking for / open to. Recruiters read this first.
   * Left empty on purpose: it is a factual claim only Michael can make.
   * A shape that fits the register, if wanted:
   * 'Looking for Summer 2027 software engineering internships.'
   */
  availability: '', // TODO — Michael's facts
};
