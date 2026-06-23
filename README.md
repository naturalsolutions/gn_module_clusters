# Module foyers d’envahissement

Module GeoNature de gestion de foyers d’envahissement.

Permet de rattacher les observations de la synthèse à des foyers afin d’en faire le suivi.

## Fonctionnalité

- Création de foyers d’envahissement, définie par :
  - un nom
  - une géométrie
  - un `cd_nom` : pas nécessairement une espèce, auquel cas les taxons enfants peuvent être ajoutés au foyer
  - un statut (actif / inactif / éradiqué)
  - un état annuel (géré / non géré / à repasser)
  - un champs de notes
- Possibilité de restreindre via les permissions l’emplacement et avec quel taxon l’utilisateur peut créer des foyers.
- Les foyers ont un gestionnaire (utilisateur ou groupe) déterminant qui peut gérer ce foyer (contrôlé également à la modification du foyer).
- Affichage carte + liste des foyers et des observations.
  - Affichage des observations sans (par défaut) et avec foyer.
  - Affichage uniquement des foyers avec droit d’édition et des observations avec droit de rattachement (par défaut) ou de tous les foyers et toutes les observations (avec droit de lecture).
  - Accès aux filtres de la synthèse pour rechercher des observations.
  - Filtre taxonomique permettant d’afficher uniquement les observations descendantes d’un taxon, et les foyers acceptant ces taxons.
  - Filtres rapides pour filtrer les foyers.
  - Activer / désactiver l’affichage des observations d’un foyer.
  - Affichage de la fiche observation.
  - Affichage de la fiche foyer avec notamment :
    - surface
    - liste des observations
    - liste des interventions
- Possibilité d’associer des observations à un foyer.
  - L’observation doit être un taxon identique ou enfant du taxon du foyer.
  - Possibilité de restreindre les observations associables par JDD (le JDD doit être associé au module).
  - Possibilité de restreindre les observations par ID source.
  - La géométrie de l’observation doit être incluse dans le foyer. Dans le cas contraire, il est proposé d’étendre (enveloppe convexe) le foyer pour inclure l’observation (et un peu plus : buffer de 15m - configurable).
  - En cas d’association à un nouveau foyer, il est proposé une géométrie englobant l’observation pour le nouveau foyer (buffer de 15m - configurable).
- Export de la fiche du foyer en PDF. Nécessite Gotenberg. Le template est un fichier statique qu’il est possible de surcharger par le mécanisme de flask dédié.
- Possibilité d’ajouter des interventions aux foyers, définie par :
  - un opérateur (champs texte)
  - une date
  - des notes
  - un statut
    - Le statut est soit un statut prédéfini (select), soit autre (champs texte)
- Possibilité, via l’admin, de définir les statuts d’intervention
  - Les statuts peuvent être associés à un taxon, et seront donc proposés uniquement pour les interventions sur un foyer dont le taxon est identique ou un taxon enfant.

## Permissions

- Objet `CLUSTERS_CLUSTERS` (gestion des foyers) : `CRUED` avec filtre scope.
  - Un scope 1 suffit pour accéder aux foyers dont le gestionnaire est un groupe auquel l’utilisateur appartient. Le scope 2 rajoute uniquement l’accès aux foyers dont le gestionnaire est un utilisateur (non groupe) ayant le même organisme.
  - L’action `C` autorise également filtres taxonomique et géographique, afin de restreindre où et quoi comme foyer l’utilisateur peut créer.
  - La modification d’un foyer vérifie également sa validité aux regards des permissions `C` et des filtres taxonomiques et géographiques associés.
- Objet `CLUSTERS_OBSERVATIONS` : action `U` avec tous les filtres de la synthèse.
  Cette permission permet de définir quelles observations de la synthèse l’utilisateur est autorisé à rattacher à ses foyers. Cette permission est utilisée pour afficher les observations dans le module.
- Objet `CLUSTERS_INTERVENTIONS_STATUS` : gestion des statuts d’intervention dans l’admin.


## Crédits

Développé par Natural Solutions pour FREDON Bretagne.
