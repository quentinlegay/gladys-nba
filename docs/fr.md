# NBA pour Gladys Assistant

Les matchs NBA dans votre calendrier Gladys, filtrés sur les horaires qui vous
conviennent : par exemple, seulement les matchs qui commencent **au plus tard à
minuit, heure française**.

Le calendrier vient de l'API publique d'ESPN : pas de compte, pas de clé.

## Installation

1. Installez l'intégration **NBA** depuis le catalogue des intégrations de
   Gladys (Gladys 5.2 ou plus récent).
2. Ouvrez sa page de configuration. Dans le bloc **Mes calendriers**,
   remplissez vos réglages (voir ci-dessous) puis cliquez sur **Activer**.
3. Un calendrier **NBA** apparaît dans vos calendriers Gladys. Il est
   **privé** : partagez-le depuis la page Calendrier pour que le reste du foyer
   et les scènes le voient.

Chaque utilisateur de Gladys active l'intégration pour lui-même et obtient son
propre calendrier, avec ses propres équipes et horaires.

## Réglages de votre calendrier

| Réglage             | Par défaut     | Rôle                                                                         |
| ------------------- | -------------- | ---------------------------------------------------------------------------- |
| Équipes             | aucune         | Les matchs de ces équipes (domicile ou extérieur). Aucune : tous les matchs. |
| Fuseau horaire      | `Europe/Paris` | Fuseau dans lequel la plage horaire est lue (nom IANA).                      |
| Début au plus tôt   | vide (06:00)   | Heure de début minimale, `HH:MM`.                                            |
| Début au plus tard  | `00:00`        | Heure de début maximale, `HH:MM`, incluse.                                   |
| Jours à l'avance    | 21             | Nombre de jours de matchs à venir (1 à 60).                                  |
| Afficher les scores | non            | Écrit le score final des matchs joués (attention aux spoilers).              |

### La plage horaire

Seuls les matchs qui **commencent** entre le début au plus tôt et le début au
plus tard sont ajoutés, les deux heures incluses. La plage se lit en avançant
dans le temps, et peut passer minuit :

| Au plus tôt | Au plus tard | Matchs gardés                                  |
| ----------- | ------------ | ---------------------------------------------- |
| _(vide)_    | `00:00`      | de 06:00 à minuit pile : la soirée européenne  |
| `18:00`     | `23:00`      | de 18:00 à 23:00 : matchs du week-end, de Noël |
| `20:00`     | `02:00`      | de 20:00 à 02:00 du matin                      |
| _(vide)_    | _(vide)_     | tous les matchs                                |

Une heure vide prend la borne de la « journée de match », qui va de **06:00 à
05:59** le lendemain matin : aucun match NBA ne commence à l'aube en Europe.

Le changement d'heure été/hiver est géré match par match : un match à 18:00 à
New York est à 00:00 à Paris en hiver, mais à 23:00 pendant les quelques
semaines de mars et de fin octobre où les deux pays ne changent pas d'heure le
même jour.

## Les événements

- **Nom** : `🏀 Celtics @ Lakers` (extérieur @ domicile) ; `(reporté)` est
  ajouté à un match reporté. Avec « Afficher les scores », un match terminé
  devient `🏀 Celtics 108 – 112 Lakers`.
- **Durée** : 2 h 30.
- **Lieu** : la salle et la ville.
- **Description** : les deux équipes, la compétition (NBA Cup, playoffs…), le
  coup d'envoi dans votre fuseau, les chaînes de télévision américaines.
- **Lien** : la page du match sur espn.com.

Les matchs annulés ne sont pas ajoutés. À chaque synchronisation, les matchs
qui ne passent plus vos filtres (horaire changé, équipe retirée, match annulé)
sont retirés du calendrier. Les événements que vous créez à la main dans ce
calendrier ne sont jamais touchés.

## Scènes

Le calendrier NBA est un calendrier Gladys comme les autres : une fois partagé,
le déclencheur **Un événement de calendrier va commencer** peut lancer une
scène avant chaque match (allumer la télé, tamiser les lumières, envoyer un
message…).

## Réglages de l'intégration (administrateur)

| Réglage                       | Par défaut | Rôle                                             |
| ----------------------------- | ---------- | ------------------------------------------------ |
| Intervalle de synchronisation | 60 min     | Fréquence de lecture d'ESPN (15 à 1440 minutes). |

Le bouton **Synchroniser maintenant** relit ESPN tout de suite et indique, pour
chaque utilisateur, combien de matchs ont été ajoutés et combien ont été
écartés par l'horaire ou par le choix des équipes.

## Dépannage

- **Le calendrier est vide** : en semaine, la plupart des matchs NBA commencent
  entre 01:00 et 04:30 heure française. Avec « au plus tard 00:00 », il ne reste
  souvent que les matchs du week-end. Videz les deux heures pour vérifier que
  les matchs arrivent bien.
- **« ESPN ne répond pas »** : l'API d'ESPN n'est pas documentée et peut être
  momentanément indisponible. Les calendriers gardent leurs matchs ; un nouvel
  essai a lieu à la synchronisation suivante.
- **Une heure ou un fuseau mal écrit** est ignoré et signalé par le bouton
  « Synchroniser maintenant ».
