#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BASE_LIBRARY_DIR = path.join(__dirname, '..', 'public', 'library');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'qcm-database.json');

function readJsonLikeModule(filePath, marker) {
  const content = fs.readFileSync(filePath, 'utf8');
  const startIndex = content.indexOf(marker);
  if (startIndex < 0) {
    throw new Error(`Cannot find marker ${marker} in ${filePath}`);
  }
  const dataStart = startIndex + marker.length;
  return JSON.parse(content.slice(dataStart));
}

function loadContent() {
  const marker = 'const content=';
  return readJsonLikeModule(path.join(__dirname, '..', 'src', 'js', 'mods', 'content.js'), marker);
}

function loadActivitiesURL() {
  const marker = 'const activitiesURL=';
  return readJsonLikeModule(path.join(__dirname, '..', 'src', 'js', 'mods', 'activitiesurl.js'), marker);
}

function findActivityFile(activityId, activitiesURLMap) {
  const direct = activitiesURLMap[activityId];
  const candidates = [];
  if (direct) {
    candidates.push(path.join(BASE_LIBRARY_DIR, direct));
  }
  const levelMatch = activityId.match(/^(\d{1,2}|[TGKH])/);
  if (levelMatch) {
    const level = levelMatch[0];
    candidates.push(path.join(BASE_LIBRARY_DIR, `N${level}`, `${activityId}.json`));
    candidates.push(path.join(BASE_LIBRARY_DIR, `N${level}`, `${activityId}.yml`));
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadActivity(activityId, activitiesURLMap) {
  const filePath = findActivityFile(activityId, activitiesURLMap);
  if (!filePath) {
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  if (filePath.endsWith('.json')) {
    data = JSON.parse(raw);
  } else if (filePath.endsWith('.yml')) {
    data = yaml.load(raw);
  } else {
    return null;
  }
  return {
    filePath: path.relative(path.join(__dirname, '..'), filePath),
    data,
  };
}

function buildDatabase() {
  const content = loadContent();
  const activitiesURLMap = loadActivitiesURL();
  const database = {};

  for (const [levelKey, levelValue] of Object.entries(content)) {
    if (levelKey === 'activitiesNumber') {
      continue;
    }
    const levelName = levelValue.nom || levelKey;
    const levelEntry = {};

    for (const theme of Object.values(levelValue.themes || {})) {
      const themeName = theme.nom;
      for (const chapter of Object.values(theme.chapitres || {})) {
        const subjectName = chapter.n;
        const fullSubjectName = `${themeName} · ${subjectName}`;
        const qcmList = [];

        for (const exercise of chapter.e || []) {
          const activity = loadActivity(exercise.id, activitiesURLMap);
          if (!activity) {
            continue;
          }
          const { data, filePath } = activity;
          qcmList.push({
            id: exercise.id,
            title: data.title || exercise.t,
            summary: data.description || null,
            source: filePath.replace(/\\/g, '/'),
            destination: data.dest || null,
          });
        }

        if (qcmList.length > 0) {
          if (!levelEntry[fullSubjectName]) {
            levelEntry[fullSubjectName] = [];
          }
          levelEntry[fullSubjectName].push(...qcmList);
        }
      }
    }

    if (Object.keys(levelEntry).length > 0) {
      database[levelName] = levelEntry;
    }
  }

  return database;
}

function main() {
  const database = buildDatabase();
  const sortedDatabase = Object.fromEntries(
    Object.entries(database)
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([level, subjects]) => {
        const sortedSubjects = Object.fromEntries(
          Object.entries(subjects)
            .sort(([a], [b]) => a.localeCompare(b, 'fr'))
            .map(([subject, qcms]) => [subject, qcms.sort((q1, q2) => q1.title.localeCompare(q2.title, 'fr'))])
        );
        return [level, sortedSubjects];
      })
  );

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sortedDatabase, null, 2), 'utf8');
  console.log(`QCM database written to ${OUTPUT_PATH}`);
}

if (require.main === module) {
  main();
}
