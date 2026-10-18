# Eras

These are the coloured ranges on the timeline, one lane per world region plus a global lane (spec section 7.1). The World lane uses fixed colours per era; regional ranges use the same colour as that polity on the border overlay, so the timeline and the map match. Until the border overlay and its polity records exist, every regional range stores its own colour in its record, taken from one palette of sixteen muted mid-tone colours shared by all lanes, on which the white labels stay readable; ranges that overlap or meet in a lane get different colours. Every range has an English and a German label. Dates are approximate ("c.") where historians give a range, and are checked against sources during the data build. Ranges in one lane may overlap; overlapping ranges stack into sub-rows.

Every row is a record `data/curated/eras/<id>.md` in the format of [content-format.md](content-format.md) (sections 2, 3 and 5), named by the row's ID. The data build checks that every row has a record and every record a row, and that the lane, both labels and both dates agree, with "c." in this list meaning an approximate date in the record ([content-format.md](content-format.md#9-spec-lists-and-records) section 9). "Start of timeline" and "End of timeline" are written `start` and `today` in the records. The Note column stays here; eras have no card text.

Every regional lane starts with the peoples who lived there before states and writing, so that no lane is empty in the deep past, which takes a large share of the watching time.

## World

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `paleolithic` | Paleolithic | Altsteinzeit | Start of timeline | c. 10,000 BCE | End date varies by region |
| `neolithic` | Neolithic | Jungsteinzeit | c. 10,000 BCE | c. 3300 BCE | Farming begins in the Near East around 9000 BCE, and later and independently in China, New Guinea, Mexico, the Andes and Africa |
| `bronze-age` | Bronze Age | Bronzezeit | c. 3300 BCE | c. 1200 BCE | Near East and Europe; China from about 2000 BCE. Most of sub-Saharan Africa went from stone to iron without a Bronze Age, and the Americas follow their own sequence |
| `iron-age` | Iron Age | Eisenzeit | c. 1200 BCE | c. 500 BCE | Overlaps with Antiquity |
| `antiquity` | Antiquity | Antike | c. 800 BCE | c. 500 CE | |
| `middle-ages` | Middle Ages | Mittelalter | c. 500 | c. 1500 | European term, used here for the World lane; elsewhere often called the post-classical period |
| `early-modern` | Early Modern Period | Frühe Neuzeit | c. 1500 | c. 1800 | Includes the Renaissance and voyages of discovery |
| `modern-era` | Modern Era | Moderne | c. 1800 | 1914 | Industrialisation, nation states, colonial empires |
| `world-wars` | Age of the World Wars | Zeitalter der Weltkriege | 1914 | 1945 | |
| `cold-war` | Post-war and Cold War | Nachkriegszeit und Kalter Krieg | 1945 | 1991 | |

## Europe and Mediterranean

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `neanderthals` | Neanderthals | Neandertaler | Start of timeline | c. 38,000 BCE | Also in western Asia; modern humans arrive in Europe around 45,000 BCE and live alongside them for a few thousand years |
| `ice-age-hunters` | Ice-age hunters | Jäger der Eiszeit | c. 43,000 BCE | c. 10,000 BCE | Upper Paleolithic: cave paintings, carved figurines, mammoth hunting |
| `mesolithic` | Mesolithic | Mittelsteinzeit | c. 10,000 BCE | c. 5500 BCE | Hunters, fishers and gatherers after the ice age; ends when farming arrives, from about 6500 BCE in Greece to about 4000 BCE in Scandinavia |
| `linear-pottery` | Linear Pottery culture | Bandkeramik | c. 5500 BCE | c. 4500 BCE | First farmers of central Europe, with longhouses |
| `megalith-builders` | Megalith builders | Megalithkultur | c. 4500 BCE | c. 1500 BCE | Stone tombs and circles from Portugal to Scandinavia, including Carnac and Stonehenge |
| `copper-age-europe` | Copper Age | Kupferzeit | c. 4500 BCE | c. 2200 BCE | Central Europe; Ötzi lived around 3300 BCE |
| `bronze-age-europe` | Bronze Age Europe | Bronzezeit in Europa | c. 2200 BCE | c. 800 BCE | Central and northern Europe; the Nebra sky disc dates from around 1600 BCE |
| `minoan` | Minoan civilisation | Minoische Kultur | c. 2000 BCE | c. 1450 BCE | Palace period on Crete |
| `mycenaean` | Mycenaean civilisation | Mykenische Kultur | c. 1600 BCE | c. 1100 BCE | |
| `etruscans` | Etruscans | Etrusker | c. 900 BCE | c. 90 BCE | Central Italy; absorbed into Rome |
| `ancient-greece` | Ancient Greece | Antikes Griechenland | c. 800 BCE | 146 BCE | Archaic, classical and Hellenistic periods |
| `hallstatt` | Hallstatt culture | Hallstattkultur | c. 800 BCE | c. 450 BCE | Early Celts in central Europe |
| `roman-kingdom` | Roman Kingdom | Römische Königszeit | 753 BCE | 509 BCE | Founding date is legendary |
| `roman-republic` | Roman Republic | Römische Republik | 509 BCE | 27 BCE | |
| `la-tene` | Celts (La Tène culture) | Kelten (Latènekultur) | c. 450 BCE | c. 50 BCE | From Gaul to Bohemia; ends with the Roman conquest of Gaul |
| `roman-principate` | Roman Empire (Principate) | Römisches Kaiserreich (Prinzipat) | 27 BCE | 284 | From Augustus |
| `late-antiquity` | Late Antiquity | Spätantike | 284 | 476 | From Diocletian; empire divided in 395 |
| `migration-period` | Migration Period | Völkerwanderung | 375 | 568 | |
| `byzantine` | Byzantine Empire | Byzantinisches Reich | 395 | 1453 | |
| `frankish` | Frankish Empire | Frankenreich | 481 | 843 | |
| `early-middle-ages` | Early Middle Ages | Frühmittelalter | c. 500 | c. 1000 | |
| `al-andalus` | Al-Andalus | Al-Andalus | 711 | 1492 | Muslim-ruled Iberia, shrinking over the centuries until Granada fell in 1492 |
| `viking-age` | Viking Age | Wikingerzeit | 793 | 1066 | |
| `kievan-rus` | Kievan Rus | Kiewer Rus | c. 882 | 1240 | Ends with the Mongol conquest |
| `holy-roman-empire` | Holy Roman Empire | Heiliges Römisches Reich | 962 | 1806 | |
| `high-middle-ages` | High Middle Ages | Hochmittelalter | c. 1000 | c. 1250 | Castles, cathedrals, the Crusades |
| `late-middle-ages` | Late Middle Ages | Spätmittelalter | c. 1250 | c. 1500 | Includes the Black Death |
| `hanseatic-league` | Hanseatic League | Hanse | c. 1356 | 1669 | Trading towns around the North Sea and the Baltic, led by Lübeck |
| `renaissance` | Renaissance | Renaissance | c. 1400 | c. 1600 | |
| `reformation` | Reformation and Wars of Religion | Reformation und Glaubenskriege | 1517 | 1648 | |
| `tsardom-of-russia` | Tsardom of Russia | Zarentum Russland | 1547 | 1721 | |
| `polish-lithuanian-commonwealth` | Polish–Lithuanian Commonwealth | Polen-Litauen | 1569 | 1795 | Ends with the partitions of Poland |
| `enlightenment` | Enlightenment | Aufklärung | c. 1680 | c. 1800 | |
| `prussia` | Kingdom of Prussia | Königreich Preußen | 1701 | 1918 | |
| `russian-empire` | Russian Empire | Russisches Kaiserreich | 1721 | 1917 | |
| `industrial-revolution` | Industrial Revolution | Industrielle Revolution | c. 1760 | c. 1840 | Starts in Britain |
| `french-revolution` | French Revolution and Napoleon | Französische Revolution und Napoleon | 1789 | 1815 | |
| `austria-hungary` | Austria-Hungary | Österreich-Ungarn | 1867 | 1918 | |
| `german-empire` | German Empire | Deutsches Kaiserreich | 1871 | 1918 | |
| `weimar-republic` | Weimar Republic | Weimarer Republik | 1918 | 1933 | Germany's first democracy |
| `soviet-union` | Soviet Union | Sowjetunion | 1922 | 1991 | Also spans northern and Central Asia |
| `nazi-germany` | Nazi Germany | Zeit des Nationalsozialismus | 1933 | 1945 | Dictatorship that started the Second World War in Europe and carried out the Holocaust |
| `divided-germany` | Divided Germany | Geteiltes Deutschland | 1949 | 1990 | West Germany and East Germany |
| `european-integration` | European integration | Europäische Einigung | 1957 | End of timeline | From the Treaties of Rome |

## Middle East and North Africa

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `natufian` | Natufian culture | Natufien | c. 12,500 BCE | c. 9500 BCE | Levant; hunter-gatherers living in the first permanent villages |
| `pre-pottery-neolithic` | Pre-Pottery Neolithic | Präkeramisches Neolithikum | c. 9500 BCE | c. 6500 BCE | First farmers; Göbekli Tepe, Jericho, Çatalhöyük |
| `green-sahara` | Green Sahara | Grüne Sahara | c. 9000 BCE | c. 3500 BCE | Wetter climate with grassland, lakes and herders where the desert is today |
| `ubaid` | Ubaid period | Obed-Zeit | c. 6500 BCE | c. 3800 BCE | First towns and irrigation in southern Mesopotamia |
| `egypt-predynastic` | Predynastic Egypt | Vordynastisches Ägypten | c. 4000 BCE | c. 3100 BCE | Naqada culture along the Nile |
| `uruk` | Uruk period | Uruk-Zeit | c. 4000 BCE | c. 3100 BCE | The first cities; writing is invented at its end |
| `egypt-early-dynastic` | Egypt: Early Dynastic period | Ägypten: Frühdynastische Zeit | c. 3100 BCE | c. 2686 BCE | |
| `sumer` | Sumerian city-states | Sumerische Stadtstaaten | c. 3100 BCE | 2334 BCE | |
| `egypt-old-kingdom` | Egypt: Old Kingdom | Ägypten: Altes Reich | c. 2686 BCE | c. 2181 BCE | Age of the pyramids |
| `akkad` | Akkadian Empire | Akkadisches Reich | c. 2334 BCE | c. 2154 BCE | |
| `egypt-first-intermediate` | Egypt: First Intermediate Period | Ägypten: Erste Zwischenzeit | c. 2181 BCE | c. 2055 BCE | |
| `egypt-middle-kingdom` | Egypt: Middle Kingdom | Ägypten: Mittleres Reich | c. 2055 BCE | c. 1650 BCE | |
| `old-babylonian` | Old Babylonian Empire | Altbabylonisches Reich | c. 1894 BCE | c. 1595 BCE | |
| `hittite` | Hittite Empire | Hethiterreich | c. 1650 BCE | c. 1180 BCE | Anatolia |
| `egypt-second-intermediate` | Egypt: Second Intermediate Period | Ägypten: Zweite Zwischenzeit | c. 1650 BCE | c. 1550 BCE | Hyksos rule in the north |
| `egypt-new-kingdom` | Egypt: New Kingdom | Ägypten: Neues Reich | c. 1550 BCE | c. 1069 BCE | |
| `phoenicia` | Phoenician city-states | Phönizische Stadtstaaten | c. 1200 BCE | 332 BCE | Tyre, Sidon, Byblos; seafaring traders who spread the alphabet |
| `egypt-third-intermediate` | Egypt: Third Intermediate Period | Ägypten: Dritte Zwischenzeit | c. 1069 BCE | 664 BCE | |
| `israel-and-judah` | Kingdoms of Israel and Judah | Königreiche Israel und Juda | c. 930 BCE | 587 BCE | Israel falls to Assyria in 720 BCE, Judah to Babylon in 587 BCE; an earlier united kingdom is debated |
| `neo-assyrian` | Neo-Assyrian Empire | Neuassyrisches Reich | 911 BCE | 609 BCE | |
| `carthage` | Carthage | Karthago | c. 814 BCE | 146 BCE | Phoenician colony that became a western Mediterranean power |
| `egypt-late-period` | Egypt: Late Period | Ägypten: Spätzeit | 664 BCE | 332 BCE | |
| `neo-babylonian` | Neo-Babylonian Empire | Neubabylonisches Reich | 626 BCE | 539 BCE | |
| `achaemenid` | Achaemenid Persian Empire | Achämenidenreich (Perserreich) | 550 BCE | 330 BCE | |
| `alexander-empire` | Empire of Alexander the Great | Reich Alexanders des Großen | 334 BCE | 323 BCE | From Greece to the Indus |
| `seleucid` | Seleucid Empire | Seleukidenreich | 312 BCE | 63 BCE | |
| `ptolemaic` | Ptolemaic Kingdom | Ptolemäerreich | 305 BCE | 30 BCE | |
| `parthian` | Parthian Empire | Partherreich | c. 247 BCE | 224 | |
| `sasanian` | Sasanian Empire | Sasanidenreich | 224 | 651 | |
| `caliphates` | Caliphates | Kalifate | 632 | 1258 | Rashidun, Umayyads, Abbasids; a golden age of science in Baghdad |
| `fatimid` | Fatimid Caliphate | Fatimiden-Kalifat | 909 | 1171 | Founded Cairo |
| `seljuk` | Seljuk Empire | Seldschukenreich | 1037 | 1194 | |
| `crusader-states` | Crusader states | Kreuzfahrerstaaten | 1098 | 1291 | |
| `ayyubid` | Ayyubid Sultanate | Ayyubiden-Sultanat | 1171 | 1260 | Founded by Saladin |
| `mamluk` | Mamluk Sultanate | Mamlukensultanat | 1250 | 1517 | Egypt and Syria |
| `ottoman` | Ottoman Empire | Osmanisches Reich | 1299 | 1922 | |
| `safavid` | Safavid Empire | Safawidenreich | 1501 | 1736 | Persia |
| `colonial-mena` | Colonial rule and mandates | Kolonialherrschaft und Mandate | 1830 | 1962 | From the French conquest of Algeria; British and French mandates after the First World War; Algeria independent in 1962 |

## Sub-Saharan Africa

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `middle-stone-age-africa` | Middle Stone Age | Mittlere Steinzeit Afrikas | Start of timeline | c. 40,000 BCE | Modern humans already live across Africa |
| `later-stone-age-africa` | Later Stone Age | Späte Steinzeit Afrikas | c. 40,000 BCE | c. 500 | End varies by region; San hunter-gatherers in southern Africa keep this way of life into modern times and leave rock art |
| `kerma` | Kerma culture | Kerma-Kultur | c. 2500 BCE | c. 1500 BCE | Nubia, before Kush |
| `bantu-expansion` | Bantu expansion | Bantu-Expansion | c. 1500 BCE | c. 500 | Start date debated |
| `nok` | Nok culture | Nok-Kultur | c. 1500 BCE | c. 1 CE | Central Nigeria; terracotta figures and early iron smelting; dates debated |
| `kush` | Kingdom of Kush | Königreich Kusch | c. 1070 BCE | c. 350 | Napata and Meroe |
| `aksum` | Kingdom of Aksum | Reich von Aksum | c. 100 | c. 940 | |
| `ghana` | Ghana Empire | Ghana-Reich | c. 300 | c. 1100 | |
| `kanem-bornu` | Kanem–Bornu Empire | Kanem-Bornu-Reich | c. 700 | 1893 | Around Lake Chad |
| `swahili-city-states` | Swahili city-states | Swahili-Stadtstaaten | c. 800 | c. 1500 | Kilwa, Mombasa and others; Indian Ocean trade; continue under Portuguese and Omani rule |
| `zagwe` | Zagwe dynasty | Zagwe-Dynastie | c. 900 | 1270 | Ethiopia; rock-cut churches of Lalibela |
| `mapungubwe` | Mapungubwe | Mapungubwe | c. 1075 | c. 1220 | Before Great Zimbabwe |
| `great-zimbabwe` | Great Zimbabwe | Groß-Simbabwe | c. 1100 | c. 1450 | |
| `benin-kingdom` | Kingdom of Benin | Königreich Benin | c. 1180 | 1897 | Benin bronzes; conquered and looted by Britain in 1897 |
| `mali` | Mali Empire | Mali-Reich | c. 1235 | c. 1670 | |
| `ethiopian-empire` | Ethiopian Empire | Kaiserreich Äthiopien | 1270 | 1974 | Never colonised; occupied by Italy from 1936 to 1941 |
| `kongo` | Kingdom of Kongo | Königreich Kongo | c. 1390 | 1914 | |
| `mutapa` | Mutapa Empire | Mutapa-Reich | c. 1430 | c. 1760 | |
| `songhai` | Songhai Empire | Songhai-Reich | c. 1464 | 1591 | |
| `atlantic-slave-trade` | Atlantic slave trade | Transatlantischer Sklavenhandel | c. 1500 | 1867 | About 12.5 million Africans forced onto ships to the Americas; many died on the way |
| `oyo` | Oyo Empire | Oyo-Reich | c. 1600 | 1836 | |
| `asante` | Asante Empire | Aschanti-Reich | 1701 | 1901 | |
| `sokoto` | Sokoto Caliphate | Kalifat von Sokoto | 1804 | 1903 | |
| `zulu-kingdom` | Zulu Kingdom | Zulureich | 1816 | 1897 | |
| `colonial-africa` | Colonial rule | Kolonialherrschaft | 1881 | c. 1975 | Scramble for Africa to decolonisation; European forts on the coasts from the 1480s and the Dutch Cape Colony from 1652 came earlier |
| `apartheid` | Apartheid | Apartheid | 1948 | End of timeline | South Africa; still in force when the timeline ends |
| `independent-africa` | Independent states | Unabhängige Staaten | 1956 | End of timeline | From Sudan and Ghana onward |

## Central Asia and steppe

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `yamnaya` | Yamnaya culture | Jamnaja-Kultur | c. 3300 BCE | c. 2600 BCE | Herders with wagons on the Pontic steppe; their link to the spread of Indo-European languages is debated |
| `oxus-civilisation` | Oxus civilisation | Oxus-Kultur | c. 2300 BCE | c. 1700 BCE | Walled towns in today's Turkmenistan, Uzbekistan and Afghanistan |
| `scythians` | Scythians | Skythen | c. 700 BCE | c. 200 BCE | Horse riders north of the Black Sea; related Saka peoples further east |
| `xiongnu` | Xiongnu | Xiongnu | c. 209 BCE | c. 91 CE | Steppe empire north of China |
| `huns` | Huns | Hunnen | c. 370 | 469 | Attila died in 453 |
| `gokturks` | Göktürk Khaganate | Reich der Göktürken | 552 | 744 | First Turkic empire |
| `uyghur-khaganate` | Uyghur Khaganate | Uigurisches Khaganat | 744 | 840 | |
| `mongol` | Mongol Empire | Mongolisches Reich | 1206 | 1368 | Spans much of Eurasia; Yuan dynasty in China |
| `golden-horde` | Golden Horde | Goldene Horde | 1242 | 1502 | Rules the Russian principalities for over two centuries |
| `timurid` | Timurid Empire | Timuridenreich | 1370 | 1507 | Capital Samarkand |
| `kazakh-khanate` | Kazakh Khanate | Kasachen-Khanat | 1465 | 1847 | |
| `russian-central-asia` | Russian and Soviet rule | Russische und sowjetische Herrschaft | c. 1850 | 1991 | Russian conquest of Central Asia; independence in 1991 |

## South Asia

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `mehrgarh` | Early farmers of Mehrgarh | Frühe Bauern von Mehrgarh | c. 7000 BCE | c. 2600 BCE | Villages at the foot of the Bolan Pass, before the Indus cities |
| `indus` | Indus Valley civilisation | Indus-Kultur | c. 3300 BCE | c. 1300 BCE | |
| `vedic` | Vedic period | Vedische Zeit | c. 1500 BCE | c. 500 BCE | |
| `mahajanapadas` | Mahajanapadas | Mahajanapadas (Großreiche) | c. 600 BCE | c. 320 BCE | Sixteen kingdoms and republics; lifetime of the Buddha |
| `maurya` | Maurya Empire | Maurya-Reich | 322 BCE | 185 BCE | |
| `anuradhapura` | Anuradhapura Kingdom | Königreich Anuradhapura | c. 377 BCE | 1017 | Sri Lanka |
| `kushan` | Kushan Empire | Kuschana-Reich | c. 30 | c. 375 | From Central Asia into northern India |
| `gupta` | Gupta Empire | Gupta-Reich | c. 320 | c. 550 | |
| `pala` | Pala Empire | Pala-Reich | c. 750 | c. 1160 | Bengal; the university of Nalanda |
| `chola` | Chola Empire | Chola-Reich | c. 850 | 1279 | Southern India; its fleets reach Southeast Asia |
| `delhi-sultanate` | Delhi Sultanate | Sultanat von Delhi | 1206 | 1526 | |
| `vijayanagara` | Vijayanagara Empire | Vijayanagar-Reich | 1336 | 1646 | Southern India |
| `mughal` | Mughal Empire | Mogulreich | 1526 | 1857 | |
| `maratha` | Maratha Empire | Marathenreich | 1674 | 1818 | |
| `company-rule` | East India Company rule | Herrschaft der Ostindien-Kompanie | 1757 | 1858 | |
| `british-raj` | British Raj | Britisch-Indien | 1858 | 1947 | |
| `india-and-pakistan` | India and Pakistan | Indien und Pakistan | 1947 | End of timeline | Independence and partition; Bangladesh from 1971 |

## East Asia

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `jomon` | Jōmon period (Japan) | Jōmon-Zeit (Japan) | c. 14,000 BCE | c. 300 BCE | Hunter-gatherers who made some of the oldest pottery in the world |
| `yangshao` | Yangshao culture | Yangshao-Kultur | c. 5000 BCE | c. 3000 BCE | Millet farmers along the Yellow River |
| `longshan` | Longshan culture | Longshan-Kultur | c. 3000 BCE | c. 1900 BCE | |
| `erlitou` | Erlitou culture | Erlitou-Kultur | c. 1900 BCE | c. 1500 BCE | Possibly the legendary Xia; debated |
| `shang` | Shang dynasty | Shang-Dynastie | c. 1600 BCE | 1046 BCE | The Xia before it is legendary and debated |
| `zhou` | Zhou dynasty | Zhou-Dynastie | 1046 BCE | 256 BCE | |
| `warring-states` | Warring States period | Zeit der Streitenden Reiche | 475 BCE | 221 BCE | |
| `yayoi` | Yayoi period (Japan) | Yayoi-Zeit (Japan) | c. 300 BCE | c. 250 | Rice farming and metal arrive from the mainland |
| `qin` | Qin dynasty | Qin-Dynastie | 221 BCE | 206 BCE | First unified empire |
| `han` | Han dynasty | Han-Dynastie | 206 BCE | 220 | |
| `three-kingdoms-korea` | Three Kingdoms of Korea | Drei Reiche Koreas | c. 57 BCE | 668 | Goguryeo, Baekje, Silla; traditional dates |
| `three-kingdoms` | Three Kingdoms | Drei Reiche | 220 | 280 | China |
| `kofun` | Kofun period (Japan) | Kofun-Zeit (Japan) | c. 250 | 538 | Great keyhole-shaped burial mounds |
| `six-dynasties` | Jin and Northern and Southern dynasties | Jin- und Südliche und Nördliche Dynastien | 280 | 589 | China divided between north and south |
| `asuka-nara` | Asuka and Nara periods (Japan) | Asuka- und Nara-Zeit (Japan) | 538 | 794 | Buddhism arrives; the first capitals |
| `sui` | Sui dynasty | Sui-Dynastie | 581 | 618 | |
| `tang` | Tang dynasty | Tang-Dynastie | 618 | 907 | |
| `tibetan-empire` | Tibetan Empire | Tibetisches Kaiserreich | 618 | 842 | |
| `unified-silla` | Unified Silla (Korea) | Vereinigtes Silla (Korea) | 668 | 935 | |
| `heian` | Heian period (Japan) | Heian-Zeit (Japan) | 794 | 1185 | |
| `five-dynasties` | Five Dynasties and Ten Kingdoms | Fünf Dynastien und Zehn Reiche | 907 | 979 | |
| `liao` | Liao dynasty | Liao-Dynastie | 916 | 1125 | Khitan rule in the north |
| `goryeo` | Goryeo (Korea) | Goryeo (Korea) | 918 | 1392 | |
| `song` | Song dynasty | Song-Dynastie | 960 | 1279 | |
| `jin-jurchen` | Jin dynasty (Jurchen) | Jin-Dynastie (Jurchen) | 1115 | 1234 | Rules northern China while the Song hold the south |
| `kamakura` | Kamakura period (Japan) | Kamakura-Zeit (Japan) | 1185 | 1333 | Rule of the shoguns and samurai begins |
| `yuan` | Yuan dynasty | Yuan-Dynastie | 1271 | 1368 | |
| `muromachi` | Muromachi period (Japan) | Muromachi-Zeit (Japan) | 1336 | 1573 | Includes the age of warring states from 1467 |
| `ming` | Ming dynasty | Ming-Dynastie | 1368 | 1644 | |
| `joseon` | Joseon (Korea) | Joseon (Korea) | 1392 | 1910 | Korean Empire from 1897 |
| `azuchi-momoyama` | Azuchi–Momoyama period (Japan) | Azuchi-Momoyama-Zeit (Japan) | 1568 | 1603 | Japan reunified |
| `edo` | Edo period (Japan) | Edo-Zeit (Japan) | 1603 | 1868 | |
| `qing` | Qing dynasty | Qing-Dynastie | 1644 | 1912 | |
| `empire-of-japan` | Empire of Japan | Japanisches Kaiserreich | 1868 | 1945 | Rapid modernisation from the Meiji period, then wars of conquest in Asia |
| `japanese-korea` | Japanese rule in Korea | Japanische Herrschaft über Korea | 1910 | 1945 | |
| `roc` | Republic of China | Republik China | 1912 | 1949 | Continues on Taiwan after 1949 |
| `postwar-japan` | Japan since 1945 | Japan seit 1945 | 1945 | End of timeline | |
| `divided-korea` | Divided Korea | Geteiltes Korea | 1945 | End of timeline | North and South Korea; Korean War from 1950 to 1953 |
| `prc` | People's Republic of China | Volksrepublik China | 1949 | End of timeline | |

## Southeast Asia

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `dong-son` | Đông Sơn culture | Đông-Sơn-Kultur | c. 1000 BCE | c. 100 | Northern Vietnam; great bronze drums |
| `funan` | Funan | Funan | c. 100 | c. 550 | Mekong delta; trade between India and China |
| `champa` | Champa | Champa | c. 200 | 1832 | Central and southern Vietnam |
| `srivijaya` | Srivijaya | Srivijaya | c. 650 | c. 1300 | Sumatra; controls the sea routes through the Strait of Malacca |
| `khmer-empire` | Khmer Empire | Khmer-Reich | 802 | 1431 | Capital Angkor |
| `pagan` | Pagan Kingdom | Königreich Bagan | c. 849 | 1297 | Myanmar; thousands of temples |
| `dai-viet` | Đại Việt | Đại Việt | 939 | 1804 | Independent Vietnam; renamed Việt Nam in 1804 |
| `majapahit` | Majapahit Empire | Majapahit-Reich | 1293 | c. 1527 | Java |
| `ayutthaya` | Ayutthaya Kingdom | Königreich Ayutthaya | 1351 | 1767 | Thailand |
| `malacca` | Malacca Sultanate | Sultanat Malakka | c. 1400 | 1511 | |
| `colonial-southeast-asia` | Colonial rule | Kolonialherrschaft | 1511 | c. 1960 | From the Portuguese capture of Malacca; most countries independent between 1945 and 1957; Thailand was never colonised |

## Americas

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `first-americans` | First Americans | Erste Amerikaner | c. 14,000 BCE | c. 8000 BCE | Ice-age hunters, including the Clovis culture; arrival date debated, possibly earlier |
| `archaic-americas` | Archaic period | Archaische Zeit | c. 8000 BCE | c. 1000 BCE | Maize is domesticated in Mexico around 7000 BCE, potatoes in the Andes |
| `caral` | Caral (Norte Chico) | Caral (Norte Chico) | c. 3000 BCE | c. 1800 BCE | Peru; the oldest known cities in the Americas |
| `olmec` | Olmec civilisation | Olmeken | c. 1200 BCE | c. 400 BCE | |
| `chavin` | Chavín culture | Chavín-Kultur | c. 900 BCE | c. 200 BCE | Andes |
| `zapotec` | Zapotec civilisation | Zapoteken | c. 500 BCE | c. 800 | Monte Albán |
| `teotihuacan` | Teotihuacan | Teotihuacán | c. 100 BCE | c. 550 | |
| `nazca` | Nazca culture | Nazca-Kultur | c. 100 BCE | c. 800 | The Nazca lines |
| `hopewell` | Hopewell culture | Hopewell-Kultur | c. 100 BCE | c. 500 | Earthworks in the Ohio valley |
| `moche` | Moche culture | Moche-Kultur | c. 100 | c. 800 | Northern Peru |
| `classic-maya` | Classic Maya | Klassische Maya | c. 250 | c. 900 | |
| `tiwanaku` | Tiwanaku | Tiwanaku | c. 500 | c. 1000 | Lake Titicaca |
| `wari` | Wari Empire | Wari-Reich | c. 600 | c. 1000 | Andes |
| `ancestral-puebloans` | Ancestral Puebloans | Vorfahren der Pueblo-Völker | c. 750 | c. 1300 | Cliff dwellings and Chaco Canyon |
| `mississippian` | Mississippian culture | Mississippi-Kultur | c. 800 | c. 1600 | Mound-building towns; Cahokia is the largest |
| `postclassic-maya` | Postclassic Maya | Postklassische Maya | c. 900 | 1697 | Chichén Itzá, Mayapán; the last Maya city falls to Spain in 1697 |
| `toltecs` | Toltecs | Tolteken | c. 900 | c. 1150 | Tula |
| `chimu` | Chimú Empire | Chimú-Reich | c. 900 | c. 1470 | Northern Peru; conquered by the Inca |
| `thule` | Thule culture | Thule-Kultur | c. 1000 | c. 1600 | Ancestors of the Inuit, spreading from Alaska to Greenland |
| `cahokia` | Cahokia | Cahokia | c. 1050 | c. 1350 | |
| `aztec` | Aztec Empire | Aztekenreich | 1428 | 1521 | |
| `inca` | Inca Empire | Inkareich | 1438 | 1533 | |
| `haudenosaunee` | Haudenosaunee Confederacy | Irokesenbund (Haudenosaunee) | c. 1450 | End of timeline | Founding date debated |
| `colonial-americas` | Colonial period | Kolonialzeit | 1492 | c. 1825 | Independence of most of the Americas by about 1825 |
| `wars-of-independence` | Wars of independence | Unabhängigkeitskriege | 1775 | 1826 | United States, Haiti (1804, the first state founded by people who had freed themselves from slavery), then Spanish America; Brazil in 1822 |
| `united-states` | United States | Vereinigte Staaten | 1776 | End of timeline | Slavery until 1865 |
| `westward-expansion` | Westward expansion and Native American removal | Westexpansion und Vertreibung der Ureinwohner | 1803 | 1890 | Settlers move west; Native nations are driven from their lands |

## Oceania

| ID | English | German | From | To | Note |
| --- | --- | --- | --- | --- | --- |
| `first-australians` | First Australians | Erste Australier | Start of timeline | End of timeline | Aboriginal peoples, one of the oldest continuous cultures on Earth; arrival around 65,000 to 50,000 BCE is debated |
| `new-guinea-farmers` | Farmers of the New Guinea Highlands | Bauern im Hochland Neuguineas | c. 7000 BCE | End of timeline | One of the places where farming was invented independently (Kuk Swamp) |
| `lapita` | Lapita culture | Lapita-Kultur | c. 1600 BCE | c. 500 BCE | |
| `polynesian-homeland` | Polynesian homeland | Polynesische Urheimat | c. 500 BCE | c. 1000 | Tonga and Samoa, before the long voyages east |
| `tui-tonga` | Tuʻi Tonga Empire | Tuʻi-Tonga-Reich | c. 950 | c. 1500 | Seafaring chiefdom ruling across western Polynesia |
| `polynesian-settlement` | Polynesian settlement | Besiedlung Polynesiens | c. 1000 | c. 1300 | Hawaii, then New Zealand around 1250 to 1300 |
| `rapa-nui` | Moai builders of Rapa Nui | Moai-Bauer von Rapa Nui | c. 1250 | c. 1600 | Easter Island |
| `maori` | Māori before colonisation | Māori vor der Kolonisierung | c. 1300 | 1840 | Ends with the Treaty of Waitangi |
| `colonial-oceania` | Colonial period | Kolonialzeit | 1788 | 1901 | From the First Fleet to Australian federation |
| `kingdom-of-hawaii` | Kingdom of Hawaii | Königreich Hawaii | 1795 | 1893 | Overthrown in 1893 by a group backed by American businessmen and US troops; annexed by the United States in 1898 |
| `colonial-pacific` | Colonial rule in New Zealand and the Pacific | Kolonialherrschaft in Neuseeland und im Pazifik | 1840 | 1980 | New Zealand Wars from 1845 to 1872; Samoa independent in 1962, Vanuatu in 1980 |
