// Where the camera looks, as saved and restored (spec milestone 1, sections 6
// and 9). A plain type, so rendering and saved state share it without either
// importing the other.

export interface CameraState {
  lat: number;
  lon: number;
  altitudeKm: number;
  heading: number;
  tilt: number;
}
