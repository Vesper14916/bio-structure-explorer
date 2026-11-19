/**
 * @module kin/ntp
 * Round 3 NTP entry and pyrophosphate (PPi) departure kinematics stub (PLAN.md §4.4, §8.1, task R3-S3).
 * Poses incoming NTP and departing PPi atom groups relative to the RNAP active site.
 */

/**
 * Pose the incoming nucleoside triphosphate (NTP) along the secondary-channel path from
 * `ntpEntry` to the RNAP active site (`i+1` register), writing atomic coordinates into `outGroup`.
 *
 * Contract (PLAN.md §8.2, §10 R3-S3):
 * - Uses `ntpState = { base, path, bonded }` and `rnapTransform = { o, R }`.
 * - Blends the NTP base frame from entry orientation to the `i+1` template partner frame.
 *
 * @param {object} ntpState - `WorldState.ntp` slice (`{ base, path, bonded }`).
 * @param {{ o: number[], R: number[] }} rnapTransform - World-space rigid transform of RNAP.
 * @param {object} asset - Decoded RNAP asset (`rnap-holo` or `rnap-ec`) providing `ntpEntry` and tracks.
 * @param {object} outGroup - Reusable AtomGroup object to populate in place.
 * @returns {object} Populated `outGroup`.
 */
export function poseNtp(ntpState, rnapTransform, asset, outGroup) {
  throw new Error('not implemented: poseNtp');
}

/**
 * Pose departing pyrophosphate (PPi) moving 18 angstroms outward along the NTP entry path
 * while fading opacity from 1 to 0 over 900 ms (PLAN.md §4.4), writing into `outGroup`.
 *
 * @param {object} ppiState - `WorldState.ppi` slice (`{ path, opacity }`).
 * @param {{ o: number[], R: number[] }} rnapTransform - World-space rigid transform of RNAP.
 * @param {object} asset - Decoded RNAP asset providing `activeSite` and `ntpEntry`.
 * @param {object} outGroup - Reusable AtomGroup object to populate in place.
 * @returns {object} Populated `outGroup`.
 */
export function posePpi(ppiState, rnapTransform, asset, outGroup) {
  throw new Error('not implemented: posePpi');
}
