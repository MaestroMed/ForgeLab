# FORGE/LAB - Issues et TODO

## Etat des Fonctionnalites (Janvier 2026)

### Implemente

| Fonctionnalite | Status | Description |
|----------------|--------|-------------|
| Player video temps reel | Complet | useVideoSync hook + VideoPlayer avec sync frame-accurate |
| WhisperX word-level | Complet | Service whisperx_alignment.py avec alignement phonemique |
| Tests E2E | Complet | Suite Pytest backend + Playwright frontend |
| Cold Open Engine | Complet | Service cold_open.py avec variations et preview A/B |
| Tracking facecam continu | Complet | Service facecam_tracking.py avec auto-reframe |
| Sound design | Complet | SFX library, auto-duck et LUFS normalization |
| Electron build production | Complet | electron-builder.config.js avec Python embarque |

---

## En Cours - Priorite Haute

- [ ] **Tests CI/CD** : Configurer GitHub Actions pour tests auto sur PR

- [ ] **Multi-GPU** : Support parallele pour analyse de segments

---

## Backlog - Priorite Moyenne

- [ ] **OCR texte ecran** : Detection texte via Tesseract/EasyOCR

- [ ] **Speaker diarization** : Identification des speakers via pyannote

- [ ] **Analytics loop** : Import stats TikTok/YouTube pour feedback

- [ ] **Auto-translation** : Sous-titres multilingues via NLLB

---

## Backlog - Priorite Basse

- [ ] **Plugin marketplace** : Interface de decouverte plugins

- [ ] **Cloud rendering** : Rendu sur serveurs cloud

- [ ] **Mobile companion** : App preview mobile

---

## Limitations Connues

1. **Memoire GPU** : Whisper large-v3 = 6GB, WhisperX = +2GB

2. **Duree VOD** : VODs >6h peuvent saturer RAM - traiter par chunks

3. **Formats exotiques** : Convertir en H.264/AAC avant import

4. **Langues WhisperX** : Optimal pour FR/EN/ES/DE/IT/PT/JA/KO/ZH

---

## Contributions Bienvenues

- Patterns detection hooks (FR/EN)
- Styles sous-titres custom
- Optimisations performance
- Tests supplementaires
- Documentation multilingue

---

## Changelog v1.1.0 (Janvier 2026)

**Nouvelles fonctionnalites:**
- Player video frame-accurate avec useVideoSync
- WhisperX alignment pour sous-titres karaoke precis
- Cold Open Engine avec preview A/B
- Tracking facecam continu avec auto-reframe
- Sound design: SFX + auto-duck + LUFS
- Build Electron avec Python embarque

**Ameliorations:**
- Performance transcription 4-6x avec BatchedInferencePipeline
- Composant ColdOpenPreview pour comparaison A/B
- Configuration electron-builder complete (Win/Mac/Linux)
- Suite de tests E2E Playwright + Pytest
