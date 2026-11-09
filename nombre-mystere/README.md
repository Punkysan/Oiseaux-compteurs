# ❓ Nombre mystère

Version numérique du jeu « Nombre mystère » : **jouable à 2 (ou 3, 4) sur une seule tablette**,
face à face (hotseat), ou contre des robots. Autonome et hors-ligne.

## Jouer

Ouvrir **`index.html`** dans un navigateur (double-clic, aucune installation).

## Règle

- Grille de **9 cases (3×3)** : **8 dessins** (chacun représente une quantité à compter) et une case **« ❓ »**.
- Placer les **étiquettes-nombres de 1 à 9** sur les cases : chaque nombre **ne sert qu'une seule fois**.
- Le **nombre mystère** est l'étiquette restante : elle va sur la case « ❓ » et rapporte **2 points**
  (les 8 autres cases rapportent 1 point chacune).
- À son tour, le joueur choisit une étiquette disponible (1-9) puis une case vide.
  Bonne étiquette = posée et marquer des points ; mauvaise = on passe la main.
- La manche finit quand les 9 cases sont étiquetées ; le match se joue en 1, 3 ou 5 manches,
  vainqueur = plus grand total de points. À la fin, la **grille résolue est affichée** (justification)
  avec le nombre mystère.

## Mode tablette face à face

- Menu « 2 joueurs sur cette tablette » (+ champ de prénoms).
- Entre les tours : écran **« 📱 Passe la tablette à… »** avec bouton « 👀 C'est mon tour ».
- Bouton **🔄 Retourner** : retourne l'écran à 180° pour le joueur assis en face.

## Fichiers

- `index.html`, `style.css`, `ui.js` : interface.
- `engine.js` : moteur pur (navigateur + Node) — génération de la grille (valeurs = permutation de 1..9,
  une case « ? »), pose des étiquettes, scores, manches, robot (facile/normal).
- `test.js` : tests du moteur.

## Tests

```bash
node nombre-mystere/test.js   # depuis la racine du dépôt
```
