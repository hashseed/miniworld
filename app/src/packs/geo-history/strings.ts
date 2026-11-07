// The interface strings of the geo-history pack, in English and German (geo-history.md, section 8).

import type { Language } from '../../engine/i18n/messages.ts';

export interface Strings {
  title: string;
  loading: string;
  loadError: string;
  play: string;
  pause: string;
  toStart: string;
  toEnd: string;
  speed: string;
  speedNames: [string, string, string, string];
  boundaries: string;
  coasts: string;
  zoomIn: string;
  zoomOut: string;
  showAll: string;
  about: string;
  close: string;
  language: string;
  today: string;
  approximately: string;
  sources: string;
  lanePeriods: string;
  laneSupercontinents: string;
  laneMoments: string;
  certainty: [string, string, string];
  certaintyNote: string;
  legendRidge: string;
  legendSubduction: string;
  legendTransform: string;
  aboutTitle: string;
  aboutBody: string[];
  aboutLimitsTitle: string;
  aboutLimits: string[];
  aboutCreditsTitle: string;
  aboutLicence: string;
}

export const STRINGS: Record<Language, Strings> = {
  en: {
    title: 'Geo-history',
    loading: 'Loading the planet…',
    loadError: 'The planet could not be loaded.',
    play: 'Play',
    pause: 'Pause',
    toStart: 'Back to 1,000 million years ago',
    toEnd: 'Forward to today',
    speed: 'Speed',
    speedNames: ['Snail', 'Regular', 'Fast', 'Fastest'],
    boundaries: 'Plate boundaries',
    coasts: "Today's coasts",
    zoomIn: 'Zoom the timeline in',
    zoomOut: 'Zoom the timeline out',
    showAll: 'Show all',
    about: 'About',
    close: 'Close',
    language: 'Language',
    today: 'Today',
    approximately: 'about',
    sources: 'Sources',
    lanePeriods: 'Geological time',
    laneSupercontinents: 'Supercontinents',
    laneMoments: 'Moments',
    certainty: ['Well constrained', 'Constrained', 'Less certain'],
    certaintyNote: 'The older the age, the less certain the map.',
    legendRidge: 'Spreading ridge: new sea floor',
    legendSubduction: 'Subduction zone: one plate sinks',
    legendTransform: 'Transform fault: plates slide past',
    aboutTitle: 'How the continents moved',
    aboutBody: [
      'This globe shows how the continents and the plates of the Earth moved over the last 1,000 million years. Press play, or drag the timeline, and watch supercontinents break apart and come together again.',
      'The plates move a few centimetres a year, about as fast as your fingernails grow. Over a million years that adds up to tens of kilometres, and over a hundred million years to whole oceans.',
    ],
    aboutLimitsTitle: 'What to keep in mind',
    aboutLimits: [
      'This is a reconstruction. The further back in time, the less is known: before about 540 million years ago the map rests on few clues, and the oceans are mostly inferred.',
      'Land colours are an expectation from the latitude the land had, not a record of the real climate. Forests, deserts and ice are shown where they would be expected, and the globe has no mountains, no ice sheets and no sea level changes.',
      'Before about 400 million years ago the model has no coastlines, so the land drawn is the area of continental crust, which is wider than the dry land was.',
      'The model uses the direction of old magnetism in rocks, which fixes the north-south position but not the east-west one. The east-west position is a convention. The Pacific plates before 83 million years ago keep only their motion relative to the continents.',
    ],
    aboutCreditsTitle: 'Data and credits',
    aboutLicence:
      'The plate model is licensed under Creative Commons Attribution 4.0 (CC BY 4.0). We selected and simplified its data. Coastlines: Natural Earth (public domain).',
  },
  de: {
    title: 'Geo-Geschichte',
    loading: 'Der Planet wird geladen…',
    loadError: 'Der Planet konnte nicht geladen werden.',
    play: 'Abspielen',
    pause: 'Pause',
    toStart: 'Zurück zu vor 1.000 Millionen Jahren',
    toEnd: 'Vor zu heute',
    speed: 'Tempo',
    speedNames: ['Schnecke', 'Normal', 'Schnell', 'Rasant'],
    boundaries: 'Plattengrenzen',
    coasts: 'Heutige Küsten',
    zoomIn: 'Zeitleiste vergrößern',
    zoomOut: 'Zeitleiste verkleinern',
    showAll: 'Alles zeigen',
    about: 'Info',
    close: 'Schließen',
    language: 'Sprache',
    today: 'Heute',
    approximately: 'etwa',
    sources: 'Quellen',
    lanePeriods: 'Erdzeitalter',
    laneSupercontinents: 'Superkontinente',
    laneMoments: 'Momente',
    certainty: ['Gut belegt', 'Belegt', 'Weniger sicher'],
    certaintyNote: 'Je älter, desto unsicherer ist die Karte.',
    legendRidge: 'Spreizungsrücken: neuer Meeresboden',
    legendSubduction: 'Subduktionszone: eine Platte taucht ab',
    legendTransform: 'Transformstörung: Platten gleiten aneinander vorbei',
    aboutTitle: 'Wie sich die Kontinente bewegten',
    aboutBody: [
      'Dieser Globus zeigt, wie sich die Kontinente und die Platten der Erde in den letzten 1.000 Millionen Jahren bewegten. Drücke auf Abspielen oder ziehe an der Zeitleiste und sieh zu, wie Superkontinente auseinanderbrechen und wieder zusammenfinden.',
      'Die Platten wandern einige Zentimeter im Jahr, ungefähr so schnell, wie deine Fingernägel wachsen. In einer Million Jahren werden daraus Dutzende Kilometer, in hundert Millionen Jahren ganze Ozeane.',
    ],
    aboutLimitsTitle: 'Was man wissen sollte',
    aboutLimits: [
      'Das ist eine Rekonstruktion. Je weiter zurück, desto weniger ist bekannt: Vor etwa 540 Millionen Jahren stützt sich die Karte auf wenige Hinweise, und die Ozeane sind größtenteils erschlossen.',
      'Die Farben des Landes sind eine Erwartung aus der Breite, in der das Land lag, keine Aufzeichnung des echten Klimas. Wälder, Wüsten und Eis sind dort gezeigt, wo man sie erwarten würde. Der Globus hat keine Berge, keine Eisschilde und keine Meeresspiegelschwankungen.',
      'Vor etwa 400 Millionen Jahren hat das Modell keine Küstenlinien. Das gezeichnete Land ist die Fläche der Kontinentalkruste, und die ist breiter als das trockene Land war.',
      'Das Modell nutzt die Richtung des alten Magnetismus in Gesteinen. Sie legt die Nord-Süd-Lage fest, aber nicht die Ost-West-Lage. Die Ost-West-Lage ist eine Konvention. Die Pazifikplatten behalten vor 83 Millionen Jahren nur ihre Bewegung relativ zu den Kontinenten.',
    ],
    aboutCreditsTitle: 'Daten und Quellen',
    aboutLicence:
      'Das Plattenmodell steht unter der Creative-Commons-Lizenz Namensnennung 4.0 (CC BY 4.0). Wir haben seine Daten ausgewählt und vereinfacht. Küstenlinien: Natural Earth (gemeinfrei).',
  },
};
