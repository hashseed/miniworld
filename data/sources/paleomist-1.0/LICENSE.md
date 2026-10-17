# PaleoMIST 1.0 licence

Gowan, E. J. (2019): Global ice sheet reconstruction for the past 80000 years. PANGAEA, https://doi.org/10.1594/PANGAEA.905800. Supplement to: Gowan, E. J., Zhang, X., Khosravi, S., Rovere, A., Stocchi, P., Hughes, A. L. C., Gyllencreutz, R., Mangerud, J., Svendsen, J.-I. and Lohmann, G. (2021): A new global ice sheet reconstruction for the past 80 000 years. Nature Communications, 12, 1199, https://doi.org/10.1038/s41467-021-21469-w.

Licence: Creative Commons Attribution 4.0 International (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/, as stated on the PANGAEA record (checked 2026-10-17).

Source archive: https://hs.pangaea.de/Maps/Global_Ice_Sheets/Gowan_ice_reconstruction.zip (3,706,381,549 bytes, sha256 e413799140fa1062bfe1c6ae6e4f9ce983e13553c6fa12866f4804bd633cdd57).

Kept here: `ice_thickness` (grounded ice thickness) and `sea_level` (relative sea level change) from `global_grid/reconstruction_0.25_degree.nc`, every 2,500 years from 52,500 years ago to today, rounded to whole metres, as Brotli-compressed grids with JSON headers made by `npm run simplify-data`. The original archive is not stored; its URL and checksum are in `data/sources.json`. The archive also holds the `calc_sl/` program under GPL-3.0, which is not used.
