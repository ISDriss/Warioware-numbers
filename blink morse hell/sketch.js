/***********************
 * Variables globales
 ***********************/
let video;
let faceMesh;
let faces = [];

// Variables pour le code Morse et la construction du mot
let currentMorse = "";
let currentWord = "";
let validatedWords = [];
let validatedDigits = [];
let badWords = [];
let message = "";

// Variables pour la détection des clignotements (anti-rebond)
let blinkCooldown = false;
const blinkCooldownTime = 500;
let leftPrevOpen = true;
let rightPrevOpen = true;
let mouthPrevOpen = false;
let lastFaceTime = 0;
const faceTimeout = 1000;

// Variables de calibration
let calibrationMode = true;
let eyeClosedRatio = null;
let eyeOpenRatio = null;
let mouthClosedRatio = null;
let mouthOpenRatio = null;
let eyeThreshold = 0.30;    // valeur par défaut, mise à jour après calibration
let mouthThreshold = 0.40;  // valeur par défaut, mise à jour après calibration

// Variable pour afficher ou non les indicateurs (bouton toggle)
let showIndicators = false;

// Dictionnaire Morse pour les lettres
const MORSE_CODE = {
  ".-": "A",
  "-...": "B",
  "-.-.": "C",
  "-..": "D",
  ".": "E",
  "..-.": "F",
  "--.": "G",
  "....": "H",
  "..": "I",
  ".---": "J",
  "-.-": "K",
  ".-..": "L",
  "--": "M",
  "-.": "N",
  "---": "O",
  ".--.": "P",
  "--.-": "Q",
  ".-.": "R",
  "...": "S",
  "-": "T",
  "..-": "U",
  "...-": "V",
  ".--": "W",
  "-..-": "X",
  "-.--": "Y",
  "--..": "Z"
};

// Liste des chiffres (en anglais, en minuscule)
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/***********************
 * p5.js preload()
 ***********************/
function preload() {
  const options = { maxFaces: 1, refineLandmarks: false, flipped: true };
  faceMesh = ml5.faceMesh(options);
}

/***********************
 * p5.js setup()
 ***********************/
function setup() {
  const canvas = createCanvas(640, 480);
  canvas.parent("canvasContainer");

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  // Démarrer la détection continue via FaceMesh
  faceMesh.detectStart(video, gotFaces);

  // Boutons de calibration
  select("#calibEyesClosed").mousePressed(calibrateEyesClosed);
  select("#calibEyesOpen").mousePressed(calibrateEyesOpen);
  select("#calibMouthClosed").mousePressed(calibrateMouthClosed);
  select("#calibMouthOpen").mousePressed(calibrateMouthOpen);
  select("#finishCalibration").mousePressed(finishCalibration);

  // Bouton pour afficher/masquer les indicateurs
  select("#toggleIndicators").mousePressed(toggleIndicators);

  // Bouton pour valider le mot
  select("#validateBtn").mousePressed(validateWord);

  console.log("Modèle FaceMesh chargé !");
}

/***********************
 * Callback FaceMesh
 ***********************/
function gotFaces(results) {
  faces = results;
  if (faces && faces.length > 0) {
    lastFaceTime = millis();
  }
}

/***********************
 * p5.js draw()
 ***********************/
function draw() {
  image(video, 0, 0, width, height);

  // Définir un cadre (rectangle) dans lequel la tête doit être
  let frameX = width / 4;
  let frameY = height / 4;
  let frameW = width / 2;
  let frameH = height / 2;
  // Par défaut, le cadre est rouge
  let frameColor = color(255, 0, 0);
  // Si une face est détectée et que la boîte englobante est entièrement dans le cadre, on passe au vert
  if (faces && faces.length > 0 && faces[0].box) {
    let box = faces[0].box;
    if (box.x >= frameX && box.y >= frameY &&
        (box.x + box.width) <= (frameX + frameW) &&
        (box.y + box.height) <= (frameY + frameH)) {
      frameColor = color(0, 255, 0);
    }
  }
  noFill();
  stroke(frameColor);
  strokeWeight(3);
  rect(frameX, frameY, frameW, frameH);

  // Mise à jour des affichages dans la page
  select("#morseDisplay").html("Code Morse en cours : " + currentMorse);
  select("#wordDisplay").html("Mot en cours : " + currentWord);
  select("#validatedDisplay").html("Mots validés : " + validatedWords.join(" "));
  select("#digitDisplay").html("Chiffres validés : " + validatedDigits.join(" "));
  select("#badWordsDisplay").html("Mauvais mots : " + badWords.join(" "));
  select("#message").html(message);

  // Afficher une bannière de calibration si celle‑ci est en cours
  if (calibrationMode) {
    fill(0, 0, 0, 150);
    noStroke();
    rect(0, 0, width, 30);
    fill(255);
    textSize(16);
    textAlign(CENTER, CENTER);
    text("Calibration en cours - Veuillez suivre les instructions", width / 2, 15);
  }

  // Si une face est détectée
  if (faces && faces.length > 0) {
    let face = faces[0];
    // Vérifier que les zones d'intérêt existent
    if (face.leftEye && face.rightEye && face.lips) {
      // Calculer les ratios pour chaque zone
      let leftEyeRatio = face.leftEye.height / face.leftEye.width;
      let rightEyeRatio = face.rightEye.height / face.rightEye.width;
      let avgEyeRatio = (leftEyeRatio + rightEyeRatio) / 2;
      let mouthRatio = face.lips.height / face.lips.width;

      // Affichage des indicateurs si activé
      if (showIndicators) {
        fill(255, 255, 0);
        noStroke();
        textSize(16);
        textAlign(LEFT, TOP);
        let indicatorText = "Œil gauche : " + leftEyeRatio.toFixed(2) +
                            " (" + (leftEyeRatio > eyeThreshold ? "Ouvert" : "Fermé") + ")\n" +
                            "Œil droit : " + rightEyeRatio.toFixed(2) +
                            " (" + (rightEyeRatio > eyeThreshold ? "Ouvert" : "Fermé") + ")\n" +
                            "Bouche : " + mouthRatio.toFixed(2) +
                            " (" + (mouthRatio > mouthThreshold ? "Ouverte" : "Fermée") + ")";
        text(indicatorText, 10, 10);
      }

      // Si nous ne sommes pas en phase de calibration, on gère la détection Morse
      if (!calibrationMode) {
        if (!blinkCooldown) {
          // Si l'œil gauche passe de ouvert à fermé (et l'œil droit reste ouvert) → point (".")
          if (!(leftEyeRatio > eyeThreshold) && leftPrevOpen && (rightEyeRatio > eyeThreshold)) {
            currentMorse += ".";
            blinkCooldown = true;
            setTimeout(() => { blinkCooldown = false; }, blinkCooldownTime);
          }
          // Si l'œil droit passe de ouvert à fermé (et l'œil gauche reste ouvert) → trait ("-")
          else if (!(rightEyeRatio > eyeThreshold) && rightPrevOpen && (leftEyeRatio > eyeThreshold)) {
            currentMorse += "-";
            blinkCooldown = true;
            setTimeout(() => { blinkCooldown = false; }, blinkCooldownTime);
          }
        }
        // Lorsque la bouche passe de fermée à ouverte, on valide le code Morse en une lettre
        if ((mouthRatio > mouthThreshold) && !mouthPrevOpen) {
          if (currentMorse.length > 0) {
            let letter = morseToLetter(currentMorse);
            if (letter) {
              currentWord += letter;
              message = "";
            } else {
              message = "Code inconnu : " + currentMorse;
            }
            currentMorse = "";
          }
        }
      }
      // Mise à jour des états précédents
      leftPrevOpen = (leftEyeRatio > eyeThreshold);
      rightPrevOpen = (rightEyeRatio > eyeThreshold);
      mouthPrevOpen = (mouthRatio > mouthThreshold);
    }
  } else {
    if (millis() - lastFaceTime > faceTimeout) {
      currentMorse = "";
    }
  }
}

/***********************
 * Fonctions de calibration
 ***********************/
function calibrateEyesClosed() {
  if (faces && faces.length > 0) {
    let face = faces[0];
    if (face.leftEye && face.rightEye) {
      let leftRatio = face.leftEye.height / face.leftEye.width;
      let rightRatio = face.rightEye.height / face.leftEye.width;
      // On prend la moyenne des ratios
      eyeClosedRatio = (leftRatio + rightRatio) / 2;
      updateCalibStatus();
    }
  }
}

function calibrateEyesOpen() {
  if (faces && faces.length > 0) {
    let face = faces[0];
    if (face.leftEye && face.rightEye) {
      let leftRatio = face.leftEye.height / face.leftEye.width;
      let rightRatio = face.rightEye.height / face.rightEye.width;
      eyeOpenRatio = (leftRatio + rightRatio) / 2;
      updateCalibStatus();
    }
  }
}

function calibrateMouthClosed() {
  if (faces && faces.length > 0) {
    let face = faces[0];
    if (face.lips) {
      mouthClosedRatio = face.lips.height / face.lips.width;
      updateCalibStatus();
    }
  }
}

function calibrateMouthOpen() {
  if (faces && faces.length > 0) {
    let face = faces[0];
    if (face.lips) {
      mouthOpenRatio = face.lips.height / face.lips.width;
      updateCalibStatus();
    }
  }
}

function updateCalibStatus() {
  let statusText = "Calibration actuelle :<br>";
  statusText += "Yeux fermés : " + (eyeClosedRatio ? eyeClosedRatio.toFixed(2) : "non calibré") + "<br>";
  statusText += "Yeux ouverts : " + (eyeOpenRatio ? eyeOpenRatio.toFixed(2) : "non calibré") + "<br>";
  statusText += "Bouche fermée : " + (mouthClosedRatio ? mouthClosedRatio.toFixed(2) : "non calibré") + "<br>";
  statusText += "Bouche ouverte : " + (mouthOpenRatio ? mouthOpenRatio.toFixed(2) : "non calibré");
  select("#calibStatus").html(statusText);
}

function finishCalibration() {
  if (eyeClosedRatio && eyeOpenRatio && mouthClosedRatio && mouthOpenRatio) {
    eyeThreshold = (eyeClosedRatio + eyeOpenRatio) / 2;
    mouthThreshold = (mouthClosedRatio + mouthOpenRatio) / 2;
    calibrationMode = false;
    select("#calibStatus").html("Calibration terminée !");
  } else {
    select("#calibStatus").html("Veuillez calibrer toutes les étapes avant de terminer.");
  }
}

/***********************
 * Affichage/Masquage des indicateurs
 ***********************/
function toggleIndicators() {
  showIndicators = !showIndicators;
  let btn = select("#toggleIndicators");
  btn.html(showIndicators ? "Masquer indicateurs" : "Afficher indicateurs");
}

/***********************
 * Conversion du code Morse en lettre
 ***********************/
function morseToLetter(code) {
  if (MORSE_CODE.hasOwnProperty(code)) {
    return MORSE_CODE[code];
  } else {
    return null;
  }
}

/***********************
 * Validation du mot
 ***********************/
function validateWord() {
  if (currentWord.length > 0) {
    validatedWords.push(currentWord);
    let lowerWord = currentWord.toLowerCase();
    if (DIGIT_WORDS.includes(lowerWord)) {
      validatedDigits.push(lowerWord);
    } else {
      badWords.push(currentWord);
    }
    currentWord = "";
  }
  // Si trois chiffres sont validés, on arrête et on affiche un message
  if (validatedDigits.length === 3) {
    message = "Bien joué !";
    noLoop();
  }
}
