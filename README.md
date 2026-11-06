# 🐦 Oiseau, compte ! — version numérique

Version web jouable et autonome (aucune dépendance, fonctionne **hors-ligne**) du jeu de cartes
officiel du Ministère de l'Éducation nationale (« Oiseaux-compteurs — Oiseau compte ! »,
période 3 à 5, Nombres et calculs).

## Jouer

Ouvrir simplement **`index.html`** dans un navigateur (double-clic, aucune installation,
aucun serveur requis).

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page du jeu (menu, table, modales) |
| `style.css` | Mise en page et design des cartes |
| `engine.js` | Moteur de règles pur (navigateur + Node) |
| `ui.js` | Interface : rendu, clics, robots, sons |
| `test.js` | Tests du moteur (`node test.js`) |

## Règles implémentées (fidèles au document officiel)

- Jeu de **40 cartes** : valeurs 1 à 10, en 4 couleurs (bleu, jaune, orange, violet).
- **Solo « défi Piou-Piou ! » (1 joueur), ou toi contre 1 à 3 robots** (2 à 4 joueurs au total).
- Aucune aide visuelle : les cartes permettant de faire un pli ne sont **pas mises en avant** ; un coup illégal est simplement refusé avec un message (comme au jeu physique).
- **Niveau des robots** : « facile » (défaut, pour les 6-7 ans : les robots jouent au hasard) ou « normal » (meilleur pli à chaque tour).
- **Justification** : quand un robot remporte une manche (ou le match), ses cartes ramassées sont affichées dans la fenêtre de fin.
- Mise en place : 3 cartes en main, **4 cartes exposées** au centre (**la volière**), le reste en pioche.
  Si 3 ou 4 cartes « 10 » sont exposées, elles sont remises dans la pioche et 4 nouvelles cartes sont exposées.
- **Faire un pli** : ramasser une carte de valeur identique (prise **prioritaire**), ou des cartes
  dont la somme est égale à la carte jouée.
- **« Piou-Piou ! »** quand un joueur ramasse toute la volière.
- Sans pli possible : on pose une carte dans la volière. On repiohe en fin de tour pour revenir à 3 cartes.
  Si la volière est vide, le joueur suivant pose une carte au centre.
- Fin de manche quand la pioche est vide et que les mains sont vides ; les cartes restées dans la
  volière ne comptent pas. Partie en une ou plusieurs manches (le donneur suivant est le joueur qui
  avait commencé la manche).
- Vainqueur : plus de cartes ramassées (base), plus de manches gagnées, ou cumul des points.

## Variantes proposées (dans le menu)

- **Variante 1** : chaque « Piou-Piou ! » rapporte 1 point bonus.
- **Variante 2** : ne ramasser que des cartes toutes paires ou toutes impaires.
- **Variante 3** : soustraction (ex. 8 = 10 − 2, donc 8 ramasse 10 et 2).
- **Variante 4** : carte jouée + cartes ramassées = 10 → 1 point.
- **Variante 5** : pas de pioche en fin de tour (redistribution de 3 cartes quand une main est vide).
- **Variantes 6 à 10** : autres façons de déterminer le vainqueur (cartes ≤ seuil, piles de 10,
  plus grande somme, plus grande suite, décompte par points 1 point par paire + couleurs, 1/4/9/16 points).

## Tests

```bash
node test.js
```

Valide la composition du jeu, la mise en place (règle des « 10 »), les règles de prise
(identique prioritaire, somme, variantes 2 et 3), le déroulement (pli, Piou-Piou, pose obligatoire,
repioche), les scores, et simule des **parties complètes** pour 1 à 4 joueurs avec toutes les
combinaisons de variantes (conservation des 40 cartes garantie).

## Crédits

Jeu original : Ministère de l'Éducation nationale, de la Jeunesse et des Sports — collection
« Oiseaux-compteurs ». Documents sources : « Oiseau compte — Attendus et règle du jeu » et
« Document d'accompagnement ».
