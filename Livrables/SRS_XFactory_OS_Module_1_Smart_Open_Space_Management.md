**XFactory OS**
**Module 1 : Smart Open Space Management**

**Spécification Fonctionnelle et Technique Détaillée (SRS)**
OCP SA - Site de Safi
Growth Culture & Collaborative Innovation - XFactory
Version 1.0

# XFactory OS - Module 1 : Smart Open Space Management

## Spécification Fonctionnelle et Technique Détaillée (SRS)

Organisation : OCP SA - Site de Safi

Entité métier : Growth Culture & Collaborative Innovation - XFactory

Produit : XFactory OS

Module : Smart Open Space Management

Version : 1.0

Langue : Français

Statut : Document de cadrage officiel pour conception et développement

## Table des matières

Résumé exécutif

Vision du projet

Contexte métier

Objectifs du module

Périmètre fonctionnel

Hors périmètre

Parties prenantes

Personas et profils utilisateurs

Analyse Product Owner

Architecture fonctionnelle cible

Exigences fonctionnelles détaillées

Règles métier complètes

Matrice RBAC

Processus BPMN en Mermaid

Cas d'utilisation UML en Mermaid

User stories

Product backlog

Architecture technique

Modèle conceptuel de données

Exigences API

Spécification du Digital Twin SVG

Spécification du XFactory AI Assistant

Spécification du dashboard exécutif

Système de notifications

Sécurité applicative

Audit logs et traçabilité

Gestion des erreurs

Description des écrans et wireframes

Exigences non fonctionnelles

Critères d'acceptation

Stratégie de tests

Stratégie de déploiement

Roadmap vers XFactory OS complet

Conclusion

# 1. Résumé exécutif

XFactory OS est la plateforme digitale cible destinée à piloter, à terme, l'ensemble des usages du bâtiment XFactory, centre d'innovation et de collaboration d'OCP SA - Site de Safi.

Le présent document définit la spécification fonctionnelle et technique complète du Module 1 : Smart Open Space Management. Ce module constitue le socle de la future plateforme Smart Building. Il porte exclusivement sur la gestion intelligente de l'Open Space, composé aujourd'hui de 28 postes de travail, répartis en 7 clusters de 4 postes chacun, avec une architecture extensible jusqu'à 40 postes, des clusters additionnels et une future logique multi-bâtiment.

L'objectif n'est pas seulement de permettre une réservation de poste. L'objectif est de concevoir une plateforme d'entreprise capable de :

représenter l'Open Space via un Digital Twin SVG interactif ;

gérer les réservations selon des règles métier claires ;

appliquer une politique de Clean Desk ;

suivre l'occupation en temps réel ;

gérer les rôles, droits et autorisations ;

produire des tableaux de bord décisionnels ;

intégrer un assistant intelligent capable d'analyser, recommander et anticiper les usages ;

préparer l'intégration future des salles, visiteurs, équipements, services bâtiment, accès CDVI Centaur, Facility Management et analytics globaux.

Le module doit être conçu comme une première brique d'une plateforme d'entreprise utilisée potentiellement par plus de 10 000 utilisateurs. Les choix d'architecture doivent donc favoriser la scalabilité, la modularité, la sécurité, l'auditabilité, l'extensibilité et l'intégration future.

# 2. Vision du projet

## 2.1 Vision long terme

La vision long terme est de faire évoluer XFactory vers un Smart Building Operating System, capable de piloter les espaces, les flux, les réservations, les services, les visiteurs, les équipements, les accès, les incidents, la performance et l'expérience utilisateur.

XFactory OS doit devenir une plateforme unique pour :

réserver les espaces ;

visualiser l'occupation en temps réel ;

gérer les droits d'accès ;

piloter les équipements ;

superviser les services du bâtiment ;

analyser la performance d'usage ;

assister les utilisateurs et administrateurs par intelligence artificielle.

## 2.2 Vision du module 1

Le module Smart Open Space Management est la première incarnation de cette vision. Il doit fournir une expérience proche d'une réservation de siège dans un avion : l'utilisateur visualise le plan, voit les postes disponibles, sélectionne son poste, choisit une plage de réservation, confirme, puis effectue un check-in lors de son arrivée.

## 2.3 Principes directeurs

| **Principe** | **Description** | **Impact produit** |
| --- | --- | --- |
| Digital Twin first | L'espace doit être compris et utilisé à partir d'un plan interactif | UX intuitive et adoption rapide |
| API first | Toutes les fonctionnalités doivent être exposables via API | Intégration future mobile, écrans, IoT |
| RBAC strict | Chaque rôle voit uniquement ce qu'il est autorisé à voir | Sécurité et lisibilité |
| Audit by design | Toute action sensible est historisée | Gouvernance, conformité, contrôle |
| Modularité | Le module Open Space doit préparer les futurs modules | Évolutivité vers XFactory OS |
| Data driven | Les décisions doivent s'appuyer sur les données d'usage | Pilotage et amélioration continue |
| AI assisted | L'IA doit assister, recommander et détecter | Optimisation proactive |

# 3. Contexte métier

## 3.1 Contexte XFactory

XFactory est le centre d'innovation et de collaboration d'OCP SA - Site de Safi. Il regroupe des espaces destinés à la collaboration, aux projets transverses, aux réunions de gouvernance, aux taskforces, aux ateliers, aux activités d'innovation et aux initiatives de transformation.

Le bâtiment s'inscrit dans une logique de plateforme collaborative. Les premières priorités opérationnelles concernent l'Open Space et les espaces exécutifs, avec une montée en charge progressive vers une gestion globale du bâtiment.

## 3.2 Contexte Open Space

L'Open Space est organisé comme suit :

| **Élément** | **Situation actuelle** | **Cible d'architecture** |
| --- | --- | --- |
| Postes de travail | 28 | jusqu'à 40 |
| Clusters | 7 | extensible |
| Postes par cluster | 4 | configurable |
| Représentation | Plan SVG interactif | Digital Twin complet |
| Réservation | À digitaliser | FIFO, demi-journée, journée, multi-jours |
| Occupation | À mesurer | temps réel, check-in, no-show |

## 3.3 Problématiques métier

| **Problème** | **Conséquence** | **Réponse attendue** |
| --- | --- | --- |
| Absence de visibilité temps réel | Difficulté à savoir quels postes sont disponibles | Digital Twin avec statuts live |
| Réservations informelles | Conflits, sous-utilisation, occupation non maîtrisée | Workflow de réservation standardisé |
| Non-présence après réservation | Postes bloqués inutilement | Check-in obligatoire et no-show automatique |
| Gestion manuelle | Charge opérationnelle, erreurs | Automatisation et self-service |
| Absence de données | Pas de pilotage d'occupation | Dashboard et analytics |
| Besoin d'équité | Risque d'appropriation abusive | FIFO, limites de durée, règles d'autorisation |
| Besoin de gouvernance | Clusters management réservés | Gestion d'autorisations spécifiques |

# 4. Objectifs du module

## 4.1 Objectifs métier

Optimiser l'occupation des postes de travail.

Offrir une expérience de réservation simple, visuelle et fiable.

Appliquer la Clean Desk Policy.

Éviter les postes bloqués par des réservations non honorées.

Piloter les usages par des indicateurs mesurables.

Poser les fondations fonctionnelles et techniques de XFactory OS.

## 4.2 Objectifs produit

| **Objectif** | **Description** | **Mesure de succès** |
| --- | --- | --- |
| Réservation intuitive | Sélection visuelle d'un poste sur Digital Twin | Temps moyen de réservation inférieur à 2 minutes |
| Occupation fiable | Check-in et check-out intégrés | Taux de no-show mesurable |
| Gouvernance claire | Droits selon rôle et règles métier | Aucun accès non autorisé |
| Pilotage exécutif | Dashboard consolidé | KPI disponibles en temps réel |
| Extensibilité | Architecture prête pour futurs modules | Ajout d'un nouveau type d'espace sans refonte majeure |

## 4.3 Objectifs techniques

Concevoir une architecture web cloud ready.

Préparer une exécution Vercel + Supabase.

Exposer des API REST ou RPC sécurisées.

Gérer l'authentification et le RBAC.

Construire un modèle de données extensible.

Supporter le temps réel via subscriptions ou websockets.

Être PWA ready et responsive.

Préparer l'intégration future de CDVI Centaur, Hager, écrans Philips et modules visiteurs.

# 5. Périmètre fonctionnel

## 5.1 Inclus dans le module 1

Le module 1 couvre :

authentification ;

gestion des rôles ;

gestion des utilisateurs ;

gestion des postes de travail ;

gestion des clusters ;

réservation Open Space ;

calendrier de réservation ;

Digital Twin SVG interactif ;

occupation temps réel ;

recherche ;

filtres avancés ;

check-in ;

check-out ;

no-show ;

liste d'attente ;

historique ;

notifications ;

emails ;

dashboard ;

rapports ;

administration ;

paramètres ;

audit logs ;

assistant IA ;

compatibilité mobile future ;

PWA ready ;

thème clair / sombre ;

responsive design ;

accessibilité.

## 5.2 Unité fonctionnelle principale

L'unité fonctionnelle principale du module est le poste de travail.

Chaque poste appartient à :

un bâtiment ;

un étage ou niveau ;

une zone ;

un Open Space ;

un cluster ;

une position SVG ;

un statut d'occupation ;

une configuration de réservation.

# 6. Hors périmètre

Les éléments suivants ne sont pas développés dans le module 1, mais doivent être anticipés dans l'architecture :

| **Élément** | **Statut** | **Préparation requise** |
| --- | --- | --- |
| Réservation des salles de réunion | Futur module | Modèle générique space |
| Gestion visiteurs | Futur module | Modèle visitor, visit, access_request |
| Gestion complète des équipements bâtiment | Futur module | Modèle equipment extensible |
| Facility Management | Futur module | Modèle service_request, maintenance_ticket |
| Intégration CDVI Centaur réelle | Future intégration | Contrats API et événements |
| Intégration Hager/domotique | Future intégration | Connecteurs services bâtiment |
| Application mobile native | Hors périmètre initial | PWA et API mobile ready |
| Gestion financière ou coûts | Hors périmètre | Aucun calcul budgétaire |
| Paie, RH ou annuaire corporate complet | Hors périmètre | Import utilisateur possible |

# 7. Parties prenantes

| **Partie prenante** | **Rôle dans le projet** | **Attentes** |
| --- | --- | --- |
| Direction du Site | Sponsor décisionnel | Vision, gouvernance, performance |
| Growth Culture & Collaborative Innovation | Product owner métier | Pilotage des usages et de la valeur |
| Building Manager | Gestion opérationnelle bâtiment | Disponibilité, discipline, reporting |
| GCI Manager | Gouvernance des espaces GCI | Validation des clusters réservés |
| IT Administrator | Sécurité, infrastructure, support | Architecture fiable et sécurisée |
| Collaborateurs | Utilisateurs finaux | Réservation simple et transparente |
| Réception | Support opérationnel | Visibilité des réservations et arrivées |
| Security | Contrôle, audit, accès | Traçabilité et alertes |
| Direction / Executive Assistant | Validation longue durée | Arbitrage des exceptions |
| Équipe développement | Conception et implémentation | Exigences précises et testables |

# 8. Personas et profils utilisateurs

## 8.1 Super Administrator

Responsable global de la configuration de la plateforme. Il gère les paramètres structurants, les rôles, les permissions, les politiques de réservation et les référentiels.

## 8.2 Administrator

Administrateur fonctionnel du module. Il gère les postes, clusters, disponibilités, paramètres opérationnels et tableaux de bord.

## 8.3 Building Manager

Responsable de la gestion opérationnelle du bâtiment. Il supervise l'occupation, les réservations, les anomalies et les clusters réservés lorsqu'il est autorisé.

## 8.4 GCI Manager

Responsable de la gouvernance Growth Culture & Collaborative Innovation. Il peut autoriser les réservations de clusters management et suivre la valeur d'usage.

## 8.5 Receptionist / Reception Manager

Profil opérationnel chargé d'accompagner les utilisateurs, de vérifier les arrivées et de consulter les réservations du jour.

## 8.6 Executive Assistant

Profil autorisé à approuver certaines réservations longues ou sensibles selon les règles définies.

## 8.7 Director

Profil de gouvernance pouvant approuver les réservations dépassant la durée maximale configurée.

## 8.8 Employee / Collaborator

Utilisateur principal. Il consulte les disponibilités, réserve un poste, effectue son check-in/check-out et reçoit les notifications.

## 8.9 Visitor

Profil futur prévu pour la plateforme globale. Dans le module 1, il est modélisé mais non activé en self-service.

## 8.10 IT Administrator

Responsable des paramètres techniques, sécurité, monitoring, intégrations et support applicatif.

## 8.11 Security

Profil chargé de consulter certains logs, alertes et informations liées à l'accès et à l'occupation.

# 9. Analyse Product Owner

## 9.1 Acteurs principaux

Collaborateur

Administrateur

Super Administrateur

Building Manager

GCI Manager

Executive Assistant

Director

Receptionist

IT Administrator

Security

## 9.2 Objectifs business

| **Objectif business** | **Justification** | **Indicateur** |
| --- | --- | --- |
| Optimiser l'occupation | Éviter les postes vides ou bloqués | Taux d'occupation |
| Fluidifier l'expérience utilisateur | Favoriser l'adoption | Temps de réservation |
| Gouverner les usages | Maintenir une discipline collective | Respect check-in/check-out |
| Protéger les zones réservées | Préserver les clusters management | Tentatives refusées |
| Mesurer la valeur | Montrer l'impact de l'Open Space | Projets, utilisateurs, pics d'usage |
| Préparer XFactory OS | Éviter une solution isolée | Réutilisation des modules |

## 9.3 Pain points

Réservation non centralisée.

Absence de cartographie interactive.

Difficulté à savoir quel poste est réellement disponible.

Risque de réservation longue non maîtrisée.

Absence de mécanisme de libération automatique.

Peu de traçabilité.

Peu de pilotage exécutif.

Aucun moteur prédictif.

## 9.4 Risques produit

| **Risque** | **Gravité** | **Réponse** |
| --- | --- | --- |
| Faible adoption utilisateur | Élevée | UX visuelle, self-service simple |
| Complexité RBAC | Élevée | Matrice de permissions centralisée |
| Réservations abusives | Moyenne | Limites, approbation, no-show |
| Données d'occupation peu fiables | Élevée | Check-in obligatoire |
| Architecture trop spécifique Open Space | Élevée | Modèle générique space, resource, booking |
| Manque de performance SVG | Moyenne | SVG optimisé, virtualisation si besoin |

## 9.5 Évolutions futures

Le module doit préparer :

réservation des salles ;

gestion du Bijou ;

visiteurs ;

équipements ;

maintenance ;

services bâtiment ;

contrôle d'accès ;

écrans de réservation ;

analytics globaux ;

application mobile ;

intégration IoT.

# 10. Architecture fonctionnelle cible

## 10.1 Domaines fonctionnels futurs de XFactory OS

La plateforme cible doit être organisée autour de 6 domaines métier :

Dashboard

Spaces & Reservations

Visitors

Services & Support

Analytics

Administration

Dans le module 1, seuls certains sous-domaines sont activés.

## 10.2 Positionnement du module 1

### Diagramme Mermaid

flowchart TB

    XOS[XFactory OS] --> D[Dashboard]

    XOS --> SR[Spaces & Reservations]

    XOS --> V[Visitors - futur]

    XOS --> SS[Services & Support - futur]

    XOS --> A[Analytics]

    XOS --> ADM[Administration]

    SR --> OS[Smart Open Space Management]

    OS --> DT[Digital Twin SVG]

    OS --> BOOK[Reservations]

    OS --> CI[Check-in / Check-out]

    OS --> NS[No Show]

    OS --> WL[Waiting List]

    ADM --> RBAC[RBAC]

    ADM --> USERS[Users]

    ADM --> SETTINGS[Settings]

    A --> KPIS[Open Space KPIs]

    D --> EXEC[Executive Dashboard]

## 10.3 Modules activés en version 1

| **Domaine** | **Module** | **Statut v1** |
| --- | --- | --- |
| Dashboard | Executive Dashboard Open Space | Inclus |
| Spaces & Reservations | Open Space reservation | Inclus |
| Spaces & Reservations | Digital Twin | Inclus |
| Spaces & Reservations | Calendar | Inclus |
| Analytics | Occupancy analytics | Inclus |
| Administration | Users, roles, settings | Inclus |
| Administration | Audit logs | Inclus |
| Services & Support | Équipements | Préparé, minimal |
| Visitors | Visiteurs | Préparé, non actif |

# 11. Exigences fonctionnelles détaillées

Les exigences sont numérotées selon le format FR-XX.

## 11.1 Authentification

| **Élément** | **Description** |
| --- | --- |
| Objectif | Permettre un accès sécurisé à la plateforme |
| Acteurs | Tous les utilisateurs |
| Entrées | Email, mot de passe, SSO futur |
| Sorties | Session authentifiée, profil, rôles |
| Règles métier | Un utilisateur inactif ne peut pas se connecter |
| UI | Page login corporate, récupération mot de passe |
| Validation | Email valide, mot de passe requis |
| Exceptions | Compte désactivé, session expirée |
| Sécurité | Hash mot de passe, MFA futur, rate limiting |
| Acceptation | Un utilisateur authentifié accède uniquement à ses modules autorisés |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-01 | Le système doit permettre la connexion par email et mot de passe | Base d'accès initiale |
| FR-02 | Le système doit préparer l'intégration SSO | Alignement entreprise |
| FR-03 | Le système doit charger les rôles et permissions à la connexion | Menus dynamiques |
| FR-04 | Le système doit expirer les sessions inactives | Sécurité |
| FR-05 | Le système doit journaliser les connexions | Auditabilité |

## 11.2 Role Management

| **Élément** | **Description** |
| --- | --- |
| Objectif | Centraliser la gestion des rôles et permissions |
| Acteurs | Super Administrator, Administrator |
| Entrées | Rôles, permissions, scopes |
| Sorties | Profils d'accès |
| Règles métier | Aucun rôle critique ne peut être supprimé s'il est affecté |
| UI | Écran rôles, détails, permissions par domaine |
| Validation | Nom unique, permissions valides |
| Exceptions | Tentative d'auto-retrait d'un rôle critique |
| Sécurité | Accès réservé aux administrateurs autorisés |
| Acceptation | Les menus changent automatiquement selon les permissions |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-06 | Le système doit gérer une liste de rôles prédéfinis | Gouvernance claire |
| FR-07 | Le système doit permettre l'affectation de permissions par module | RBAC complet |
| FR-08 | Le système doit supporter des permissions CRUD | Contrôle fin |
| FR-09 | Le système doit supporter des permissions d'approbation | Workflows sensibles |
| FR-10 | Le système doit historiser toute modification de rôle | Audit |

## 11.3 User Management

| **Élément** | **Description** |
| --- | --- |
| Objectif | Administrer les comptes utilisateurs |
| Acteurs | Super Administrator, Administrator |
| Entrées | Nom, email, rôle, département, statut |
| Sorties | Utilisateur créé ou mis à jour |
| Règles métier | Un email ne peut appartenir qu'à un seul utilisateur |
| UI | Liste utilisateurs, filtres, fiche utilisateur |
| Validation | Email, rôle, statut obligatoires |
| Exceptions | Doublon, rôle invalide |
| Sécurité | Masquage des données selon rôle |
| Acceptation | Un administrateur peut créer, modifier, désactiver un utilisateur |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-11 | Le système doit gérer les utilisateurs internes | Réservation nominative |
| FR-12 | Le système doit supporter les visiteurs futurs | Extensibilité |
| FR-13 | Le système doit associer chaque utilisateur à un département | Analytics |
| FR-14 | Le système doit gérer le statut actif/inactif | Sécurité |
| FR-15 | Le système doit importer des utilisateurs en masse | Scalabilité |

## 11.4 Workstation Management

| **Élément** | **Description** |
| --- | --- |
| Objectif | Gérer le référentiel des postes de travail |
| Acteurs | Administrator, Building Manager |
| Entrées | Code poste, cluster, position SVG, statut |
| Sorties | Poste disponible dans le Digital Twin |
| Règles métier | Un poste désactivé ne peut pas être réservé |
| UI | Inventaire postes, fiche poste, statut |
| Validation | Code unique, cluster obligatoire |
| Exceptions | Poste lié à réservation active |
| Sécurité | Modification réservée aux gestionnaires |
| Acceptation | Le poste apparaît correctement sur le Digital Twin |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-16 | Le système doit gérer jusqu'à 40 postes minimum | Évolution prévue |
| FR-17 | Le système doit associer chaque poste à une position SVG | Digital Twin |
| FR-18 | Le système doit gérer les statuts : disponible, réservé, occupé, désactivé, maintenance | Pilotage |
| FR-19 | Le système doit permettre la désactivation temporaire d'un poste | Maintenance |
| FR-20 | Le système doit afficher l'historique d'un poste | Traçabilité |

## 11.5 Cluster Management

| **Élément** | **Description** |
| --- | --- |
| Objectif | Gérer les regroupements de postes |
| Acteurs | Administrator, GCI Manager, Building Manager |
| Entrées | Nom cluster, postes, statut, règles |
| Sorties | Cluster exploitable dans le Digital Twin |
| Règles métier | Deux clusters sont réservés management et désactivés par défaut |
| UI | Liste clusters, détails, autorisations |
| Validation | Nom unique, postes associés |
| Exceptions | Cluster management sans autorisation |
| Sécurité | Autorisation par GCI Manager ou Building Manager |
| Acceptation | Un cluster désactivé bloque ses postes |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-21 | Le système doit gérer 7 clusters initiaux | Situation actuelle |
| FR-22 | Le système doit supporter l'ajout de clusters | Extensibilité |
| FR-23 | Le système doit identifier les clusters management | Règle métier clé |
| FR-24 | Le système doit désactiver par défaut les clusters management | Gouvernance |
| FR-25 | Le système doit autoriser exceptionnellement un cluster management | Besoin opérationnel |

## 11.6 Reservation Management

| **Élément** | **Description** |
| --- | --- |
| Objectif | Permettre la réservation fiable d'un poste |
| Acteurs | Employee, Administrator, Receptionist |
| Entrées | Poste, date, type, durée |
| Sorties | Réservation confirmée ou en attente |
| Règles métier | FIFO, durée maximale, approbation si dépassement |
| UI | Digital Twin, calendrier, confirmation |
| Validation | Disponibilité, droits, durée |
| Exceptions | Conflit, poste indisponible, approbation requise |
| Sécurité | Un utilisateur ne peut modifier que ses réservations sauf autorisation |
| Acceptation | Une réservation valide bloque le poste sur la période choisie |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-26 | Le système doit permettre les réservations demi-journée | Usage flexible |
| FR-27 | Le système doit permettre les réservations journée | Usage standard |
| FR-28 | Le système doit permettre les réservations multi-jours | Besoin projet |
| FR-29 | Le système doit appliquer le FIFO en cas de concurrence | Équité |
| FR-30 | Le système doit déclencher une approbation si durée > maximum admin | Gouvernance |
| FR-31 | Le système doit empêcher les réservations en conflit | Fiabilité |
| FR-32 | Le système doit permettre l'annulation utilisateur avant début | Flexibilité |
| FR-33 | Le système doit générer un historique de réservation | Audit et analytics |

## 11.7 Reservation Calendar

| **Élément** | **Description** |
| --- | --- |
| Objectif | Visualiser les réservations dans le temps |
| Acteurs | Employee, Receptionist, Administrator |
| Entrées | Date, période, cluster, utilisateur |
| Sorties | Vue calendrier |
| Règles métier | Respect du RBAC |
| UI | Jour, semaine, mois, filtre cluster |
| Validation | Plage de dates valide |
| Exceptions | Aucune donnée |
| Sécurité | Données nominatives masquées selon profil |
| Acceptation | L'utilisateur voit ses réservations et les disponibilités |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-34 | Le système doit proposer une vue jour | Usage opérationnel |
| FR-35 | Le système doit proposer une vue semaine | Planification |
| FR-36 | Le système doit proposer une vue mois | Analyse |
| FR-37 | Le système doit filtrer par cluster | Lisibilité |
| FR-38 | Le système doit distinguer réservation, occupation et no-show | Pilotage |

## 11.8 Interactive SVG Digital Twin

| **Élément** | **Description** |
| --- | --- |
| Objectif | Représenter l'Open Space de manière interactive |
| Acteurs | Tous les utilisateurs autorisés |
| Entrées | SVG, positions, statuts, événements |
| Sorties | Plan interactif live |
| Règles métier | Statut poste visible en temps réel |
| UI | Zoom, pan, hover, click, sélection |
| Validation | Poste cliquable et lié au référentiel |
| Exceptions | SVG non chargé, poste sans correspondance |
| Sécurité | Actions conditionnées au rôle |
| Acceptation | Un utilisateur peut sélectionner un poste disponible depuis le plan |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-39 | Le Digital Twin doit représenter murs, circulation et entrées | Compréhension spatiale |
| FR-40 | Le Digital Twin doit représenter les postes et clusters | Réservation visuelle |
| FR-41 | Le Digital Twin doit représenter équipements, imprimantes, displays | Préparation futurs modules |
| FR-42 | Le Digital Twin doit représenter les zones désactivées | Gouvernance |
| FR-43 | Le Digital Twin doit supporter zoom et pan | Ergonomie |
| FR-44 | Le Digital Twin doit supporter hover et click | Interaction |
| FR-45 | Le Digital Twin doit se rafraîchir en temps réel | Fiabilité |
| FR-46 | Le Digital Twin doit être responsive | Mobile ready |

## 11.9 Real-time Occupancy

| **Élément** | **Description** |
| --- | --- |
| Objectif | Afficher l'état réel des postes |
| Acteurs | Tous |
| Entrées | Réservations, check-in, check-out, no-show |
| Sorties | Statuts live |
| Règles métier | Occupé seulement après check-in |
| UI | Couleurs de statut, badges, tooltip |
| Validation | Cohérence réservation/occupation |
| Exceptions | Perte connexion temps réel |
| Sécurité | Pas d'information sensible excessive |
| Acceptation | Un changement de statut apparaît sans rechargement complet |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-47 | Le système doit afficher le statut disponible | Action utilisateur |
| FR-48 | Le système doit afficher le statut réservé | Prévention conflit |
| FR-49 | Le système doit afficher le statut occupé | Occupation réelle |
| FR-50 | Le système doit afficher le statut no-show | Discipline |
| FR-51 | Le système doit utiliser un canal temps réel | Expérience live |

## 11.10 Search Engine et filtres avancés

| **Élément** | **Description** |
| --- | --- |
| Objectif | Rechercher rapidement un poste ou une réservation |
| Acteurs | Tous selon droits |
| Entrées | Mot-clé, cluster, date, statut |
| Sorties | Résultats filtrés |
| Règles métier | Résultats limités au périmètre autorisé |
| UI | Barre recherche, filtres, tri |
| Validation | Requête non dangereuse |
| Exceptions | Aucun résultat |
| Sécurité | Protection contre injection |
| Acceptation | Recherche rapide en moins de 500 ms sur données courantes |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-52 | Le système doit rechercher par code poste | Efficacité |
| FR-53 | Le système doit filtrer par cluster | Lisibilité |
| FR-54 | Le système doit filtrer par disponibilité | Réservation rapide |
| FR-55 | Le système doit filtrer par équipement futur | Extensibilité |
| FR-56 | Le système doit sauvegarder des filtres utilisateur | Ergonomie |

## 11.11 Check-in

| **Élément** | **Description** |
| --- | --- |
| Objectif | Confirmer la présence réelle |
| Acteurs | Employee, Receptionist |
| Entrées | Réservation active, action check-in |
| Sorties | Poste occupé |
| Règles métier | Check-in dans les 30 minutes suivant le début |
| UI | Bouton check-in, statut, confirmation |
| Validation | Réservation active, utilisateur autorisé |
| Exceptions | Check-in tardif, poste libéré |
| Sécurité | Check-in par propriétaire ou profil autorisé |
| Acceptation | Le poste passe de réservé à occupé |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-57 | Le système doit demander un check-in après début de réservation | Donnée fiable |
| FR-58 | Le système doit permettre check-in depuis web/PWA | Ergonomie |
| FR-59 | Le système doit notifier l'utilisateur avant expiration | Réduction no-show |
| FR-60 | Le système doit refuser un check-in non autorisé | Sécurité |

## 11.12 Check-out

| **Élément** | **Description** |
| --- | --- |
| Objectif | Libérer le poste à la fin ou avant la fin |
| Acteurs | Employee, Receptionist |
| Entrées | Réservation occupée |
| Sorties | Poste libéré |
| Règles métier | Check-out automatique à fin de créneau si non fait |
| UI | Bouton check-out |
| Validation | Réservation occupée |
| Exceptions | Déjà terminé |
| Sécurité | Propriétaire ou rôle autorisé |
| Acceptation | Le poste redevient disponible selon calendrier |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-61 | Le système doit permettre le check-out manuel | Libération anticipée |
| FR-62 | Le système doit effectuer un check-out automatique à la fin | Cohérence |
| FR-63 | Le système doit historiser l'heure réelle de départ | Analytics |

## 11.13 No Show

| **Élément** | **Description** |
| --- | --- |
| Objectif | Libérer les postes non honorés |
| Acteurs | Système, Employee, Administrator |
| Entrées | Réservation sans check-in après 30 min |
| Sorties | Statut no-show, poste disponible |
| Règles métier | No-show automatique après 30 minutes |
| UI | Statut et notification |
| Validation | Aucun check-in dans la fenêtre |
| Exceptions | Dérogation admin |
| Sécurité | Action système historisée |
| Acceptation | Le poste devient automatiquement disponible |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-64 | Le système doit lancer un job de détection no-show | Automatisation |
| FR-65 | Le système doit libérer le poste après no-show | Optimisation |
| FR-66 | Le système doit notifier l'utilisateur | Transparence |
| FR-67 | Le système doit alimenter le KPI no-show | Gouvernance |

## 11.14 Waiting List

| **Élément** | **Description** |
| --- | --- |
| Objectif | Gérer la demande lorsque les postes sont complets |
| Acteurs | Employee |
| Entrées | Date, préférence cluster/poste |
| Sorties | Position dans liste d'attente |
| Règles métier | FIFO sur liste d'attente |
| UI | Bouton rejoindre liste |
| Validation | Pas de réservation concurrente identique |
| Exceptions | Place disponible avant inscription |
| Sécurité | Visible uniquement au demandeur et admins |
| Acceptation | Le premier en liste reçoit la proposition lors d'une libération |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-68 | Le système doit créer une liste d'attente par période | Gestion demande |
| FR-69 | Le système doit appliquer FIFO | Équité |
| FR-70 | Le système doit notifier en cas de disponibilité | Réactivité |
| FR-71 | Le système doit expirer les offres non confirmées | Fluidité |

## 11.15 Reservation History

| **Élément** | **Description** |
| --- | --- |
| Objectif | Consulter l'historique d'utilisation |
| Acteurs | Employee, Administrator, Manager |
| Entrées | Utilisateur, poste, période |
| Sorties | Historique |
| Règles métier | Accès selon rôle |
| UI | Tableau, filtres, export |
| Validation | Période valide |
| Exceptions | Historique vide |
| Sécurité | Respect confidentialité |
| Acceptation | Un utilisateur voit ses historiques, un admin voit le périmètre autorisé |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-72 | Le système doit historiser toutes les réservations | Audit |
| FR-73 | Le système doit historiser les modifications | Traçabilité |
| FR-74 | Le système doit exporter l'historique | Reporting |

## 11.16 Notifications et emails

| **Élément** | **Description** |
| --- | --- |
| Objectif | Informer les utilisateurs et approbateurs |
| Acteurs | Tous |
| Entrées | Événements système |
| Sorties | Notification in-app, email |
| Règles métier | Notifications selon préférences et criticité |
| UI | Centre de notifications |
| Validation | Destinataire valide |
| Exceptions | Email non délivré |
| Sécurité | Pas de données sensibles inutiles |
| Acceptation | Une réservation confirmée génère une notification |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-75 | Le système doit notifier une confirmation | Clarté |
| FR-76 | Le système doit notifier un rappel check-in | Réduction no-show |
| FR-77 | Le système doit notifier une annulation | Transparence |
| FR-78 | Le système doit notifier une demande d'approbation | Workflow |
| FR-79 | Le système doit notifier un no-show | Discipline |

## 11.17 Dashboard et rapports

| **Élément** | **Description** |
| --- | --- |
| Objectif | Piloter l'utilisation Open Space |
| Acteurs | Direction, GCI Manager, Building Manager, Administrator |
| Entrées | Réservations, occupation, utilisateurs |
| Sorties | KPI, graphiques, exports |
| Règles métier | Données filtrées selon périmètre |
| UI | Dashboard exécutif |
| Validation | Indicateurs cohérents |
| Exceptions | Données insuffisantes |
| Sécurité | Accès restreint |
| Acceptation | Les KPI clés sont visibles et exportables |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-80 | Le dashboard doit afficher le taux d'occupation | KPI central |
| FR-81 | Le dashboard doit afficher postes disponibles/réservés | Situation live |
| FR-82 | Le dashboard doit afficher peak hours | Optimisation |
| FR-83 | Le dashboard doit afficher heat map | Analyse spatiale |
| FR-84 | Le dashboard doit afficher cluster usage | Pilotage clusters |
| FR-85 | Le dashboard doit afficher no-shows | Discipline |
| FR-86 | Le dashboard doit afficher tendances | Décision |
| FR-87 | Le dashboard doit exporter PDF/Excel | Reporting |

## 11.18 Administration et settings

| **Élément** | **Description** |
| --- | --- |
| Objectif | Configurer le module |
| Acteurs | Super Administrator, Administrator |
| Entrées | Paramètres système |
| Sorties | Règles appliquées |
| Règles métier | Certains paramètres exigent audit |
| UI | Panneau settings |
| Validation | Valeurs cohérentes |
| Exceptions | Paramètre invalide |
| Sécurité | Accès restreint |
| Acceptation | Un changement de durée maximale impacte les réservations futures |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-88 | Le système doit configurer la durée maximale sans approbation | Règle clé |
| FR-89 | Le système doit configurer le délai no-show | Par défaut 30 min |
| FR-90 | Le système doit configurer jours ouvrables et horaires | Gouvernance |
| FR-91 | Le système doit configurer règles par cluster | Flexibilité |
| FR-92 | Le système doit configurer thèmes et préférences | UX |

## 11.19 Audit Logs

| **Élément** | **Description** |
| --- | --- |
| Objectif | Tracer les actions sensibles |
| Acteurs | Super Administrator, Security, IT Administrator |
| Entrées | Actions utilisateur/système |
| Sorties | Journal horodaté |
| Règles métier | Logs non modifiables par utilisateurs standards |
| UI | Audit log viewer |
| Validation | Événement complet |
| Exceptions | Erreur de journalisation critique |
| Sécurité | Accès restreint |
| Acceptation | Toute action critique apparaît dans les logs |

### Exigences

| **ID** | **Exigence** | **Justification** |
| --- | --- | --- |
| FR-93 | Le système doit journaliser création/modification/suppression | Audit |
| FR-94 | Le système doit journaliser approbations/refus | Gouvernance |
| FR-95 | Le système doit journaliser changements RBAC | Sécurité |
| FR-96 | Le système doit permettre filtres par date, acteur, entité | Exploitabilité |

# 12. Règles métier complètes

| **ID** | **Règle** | **Description** | **Impact** |
| --- | --- | --- | --- |
| BR-01 | FIFO | La première demande valide obtient la réservation | Équité |
| BR-02 | Pas de validation manager standard | Une réservation normale est confirmée automatiquement | Simplicité |
| BR-03 | Types de réservation | Demi-journée, journée, multi-jours | Flexibilité |
| BR-04 | Durée maximale configurable | Définie par l'administrateur | Gouvernance |
| BR-05 | Approbation si dépassement | Si durée > maximum, approbation obligatoire | Contrôle |
| BR-06 | Approbateurs longue durée | Executive Assistant ou Director | Autorité |
| BR-07 | Clusters management | Deux clusters réservés management | Priorisation |
| BR-08 | Clusters management désactivés par défaut | Non réservables par défaut | Protection |
| BR-09 | Autorisation clusters management | GCI Manager ou Building Manager | Gouvernance |
| BR-10 | Clean Desk Policy | Le poste doit être libéré après usage | Discipline |
| BR-11 | Check-in obligatoire | Confirmation de présence requise | Données fiables |
| BR-12 | No-show après 30 minutes | Sans check-in, réservation annulée | Optimisation |
| BR-13 | Libération automatique | Après no-show, poste disponible | Réactivité |
| BR-14 | Une réservation active par créneau | Empêcher doublons utilisateur | Équité |
| BR-15 | Historisation obligatoire | Toute action sensible est tracée | Audit |

# 13. Matrice RBAC

Légende : R lecture, C création, U modification, D suppression, A approbation, X accès interdit.

| **Fonction** | **Super Admin** | **Admin** | **Building Manager** | **GCI Manager** | **Receptionist** | **Executive Assistant** | **Director** | **Employee** | **Visitor** | **IT Admin** | **Security** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard exécutif | R | R | R | R | X | R | R | X | X | R | X |
| Réserver poste standard | C | C | C | C | C | C | C | C | X | C | X |
| Modifier sa réservation | U | U | U | U | U | U | U | U | X | U | X |
| Modifier réservation d'autrui | U | U | U | U | U | X | X | X | X | X | X |
| Approuver longue durée | A | A | X | X | X | A | A | X | X | X | X |
| Autoriser cluster management | A | A | A | A | X | X | X | X | X | X | X |
| Gérer postes | CRUD | CRUD | RU | RU | R | R | R | R | X | R | R |
| Gérer clusters | CRUD | CRUD | RU | RU | R | R | R | R | X | R | R |
| Gérer utilisateurs | CRUD | CRUD | R | R | X | X | X | X | X | R | X |
| Gérer rôles | CRUD | R | X | X | X | X | X | X | X | R | X |
| Paramètres réservation | CRUD | CRUD | R | R | X | X | X | X | X | R | X |
| Audit logs | R | R | R | R | X | X | R | X | X | R | R |
| Analytics | R | R | R | R | X | R | R | X | X | R | R |
| Administration technique | R | X | X | X | X | X | X | X | X | CRUD | X |

# 14. Processus BPMN en Mermaid

## 14.1 Réservation standard FIFO

### Diagramme Mermaid

flowchart LR

    A[Utilisateur ouvre le Digital Twin] --> B[Choisit date et type de réservation]

    B --> C[Consulte postes disponibles]

    C --> D[Selectionne un poste]

    D --> E{Poste disponible ?}

    E -- Non --> F[Proposer autre poste ou liste d'attente]

    E -- Oui --> G{Durée <= max configuré ?}

    G -- Oui --> H[Créer réservation confirmée]

    G -- Non --> I[Créer demande en attente d'approbation]

    H --> J[Notifier utilisateur]

    I --> K[Notifier approbateur]

## 14.2 Approbation longue durée

### Diagramme Mermaid

flowchart TB

    A[Demande multi-jours longue durée] --> B[Statut pending approval]

    B --> C[Executive Assistant ou Director reçoit notification]

    C --> D{Décision}

    D -- Approuver --> E[Réservation confirmée]

    D -- Refuser --> F[Réservation refusée]

    E --> G[Notification utilisateur]

    F --> H[Notification avec motif]

    E --> I[Audit log]

    F --> I

## 14.3 Check-in et no-show

### Diagramme Mermaid

flowchart TB

    A[Début de réservation] --> B[Timer 30 minutes]

    B --> C{Check-in effectué ?}

    C -- Oui --> D[Poste occupé]

    C -- Non --> E[Réservation No Show]

    E --> F[Libérer poste]

    E --> G[Notifier utilisateur]

    E --> H[Alimenter KPI no-show]

    D --> I[Check-out manuel ou automatique]

    I --> J[Poste libéré]

## 14.4 Autorisation cluster management

### Diagramme Mermaid

flowchart LR

    A[Utilisateur choisit poste management] --> B{Cluster autorisé ?}

    B -- Non --> C[Demande d'autorisation]

    C --> D[GCI Manager ou Building Manager]

    D --> E{Décision}

    E -- Approuver --> F[Activation temporaire]

    E -- Refuser --> G[Refus avec motif]

    B -- Oui --> H[Réservation selon règles standard]

    F --> H

# 15. Cas d'utilisation UML en Mermaid

### Diagramme Mermaid

flowchart TB

    Employee((Employee))

    Admin((Administrator))

    SuperAdmin((Super Administrator))

    BM((Building Manager))

    GCI((GCI Manager))

    EA((Executive Assistant))

    Director((Director))

    Reception((Receptionist))

    Security((Security))

    IT((IT Administrator))

    UC1[Consulter Digital Twin]

    UC2[Réserver un poste]

    UC3[Effectuer Check-in]

    UC4[Effectuer Check-out]

    UC5[Annuler réservation]

    UC6[Approuver longue durée]

    UC7[Autoriser cluster management]

    UC8[Gérer postes]

    UC9[Gérer clusters]

    UC10[Gérer utilisateurs]

    UC11[Gérer rôles]

    UC12[Consulter dashboard]

    UC13[Consulter audit logs]

    UC14[Configurer règles]

    UC15[Analyser par IA]

    Employee --> UC1

    Employee --> UC2

    Employee --> UC3

    Employee --> UC4

    Employee --> UC5

    Reception --> UC1

    Reception --> UC2

    Reception --> UC3

    EA --> UC6

    Director --> UC6

    BM --> UC7

    GCI --> UC7

    Admin --> UC8

    Admin --> UC9

    Admin --> UC10

    Admin --> UC12

    Admin --> UC14

    SuperAdmin --> UC10

    SuperAdmin --> UC11

    SuperAdmin --> UC14

    Security --> UC13

    IT --> UC13

    IT --> UC14

    BM --> UC12

    GCI --> UC12

    Director --> UC12

    Admin --> UC15

# 16. User stories

| **ID** | **User story** | **Priorité** | **Critères d'acceptation** |
| --- | --- | --- | --- |
| US-01 | En tant que collaborateur, je veux voir les postes disponibles sur un plan interactif afin de choisir facilement mon emplacement | Must | Disponibilité visible, clic possible |
| US-02 | En tant que collaborateur, je veux réserver un poste en demi-journée afin de planifier une présence partielle | Must | Créneau matin/après-midi disponible |
| US-03 | En tant que collaborateur, je veux effectuer mon check-in afin de confirmer ma présence | Must | Statut poste devient occupé |
| US-04 | En tant qu'administrateur, je veux définir la durée maximale sans approbation afin de contrôler les longues réservations | Must | Paramètre appliqué aux nouvelles réservations |
| US-05 | En tant qu'Executive Assistant, je veux approuver les réservations longues afin de contrôler les exceptions | Must | Approbation modifie le statut |
| US-06 | En tant que GCI Manager, je veux autoriser l'utilisation d'un cluster management afin de gérer les cas spécifiques | Must | Cluster temporairement réservable |
| US-07 | En tant que Building Manager, je veux consulter le taux d'occupation afin de piloter l'espace | Must | KPI visible sur dashboard |
| US-08 | En tant que réceptionniste, je veux consulter les réservations du jour afin d'assister les utilisateurs | Should | Vue journalière filtrable |
| US-09 | En tant qu'administrateur, je veux gérer les postes et leurs statuts afin de maintenir le référentiel | Must | CRUD postes disponible |
| US-10 | En tant que directeur, je veux consulter les tendances d'utilisation afin d'évaluer la valeur du module | Should | Tendances hebdo/mensuelles |
| US-11 | En tant qu'utilisateur, je veux recevoir une notification avant expiration du check-in afin d'éviter un no-show | Should | Notification envoyée |
| US-12 | En tant qu'administrateur, je veux exporter un rapport Excel afin de partager les données d'usage | Should | Export généré |
| US-13 | En tant que Security, je veux consulter les logs critiques afin d'assurer la traçabilité | Should | Logs filtrables |
| US-14 | En tant qu'IT Admin, je veux superviser les erreurs applicatives afin de garantir la disponibilité | Should | Monitoring disponible |
| US-15 | En tant qu'administrateur, je veux interroger l'assistant IA afin d'obtenir une analyse rapide | Could | Réponse contextualisée |

# 17. Product backlog

## 17.1 MVP

| **Epic** | **Fonctionnalité** | **Priorité** |
| --- | --- | --- |
| Auth & RBAC | Login, rôles, permissions | P0 |
| Open Space Core | Postes, clusters, statuts | P0 |
| Digital Twin | SVG interactif, sélection poste | P0 |
| Reservation | FIFO, demi-journée, journée, multi-jours | P0 |
| Check-in/out | Check-in, no-show, libération | P0 |
| Dashboard | KPI essentiels | P0 |
| Administration | Settings durée max, délai no-show | P0 |
| Notifications | Confirmation, rappel, approbation | P1 |
| Audit | Logs actions critiques | P1 |

## 17.2 Release 1.1

| **Epic** | **Fonctionnalité** | **Priorité** |
| --- | --- | --- |
| Analytics | Heatmap, tendances, exports | P1 |
| Waiting List | FIFO, notification disponibilité | P1 |
| AI Assistant | Recommandations de postes | P1 |
| PWA | Installation, mode offline partiel | P2 |
| Access Control readiness | Modèle d'événements CDVI | P2 |

## 17.3 Release 1.2

| **Epic** | **Fonctionnalité** | **Priorité** |
| --- | --- | --- |
| AI Advanced | Prédictions d'occupation | P2 |
| Equipment readiness | Équipements liés aux postes/clusters | P2 |
| Multi-building readiness | Référentiel bâtiment/étage | P2 |
| API Public interne | API documentée pour intégrations | P2 |

# 18. Architecture technique

## 18.1 Architecture cible

### Diagramme Mermaid

flowchart TB

    UI[Web App / PWA] --> AUTH[Authentication Layer]

    UI --> API[API Layer]

    API --> RBAC[RBAC Policy Engine]

    API --> BOOK[Booking Service]

    API --> SPACE[Space Service]

    API --> TWIN[Digital Twin Service]

    API --> NOTIF[Notification Service]

    API --> AI[AI Assistant Service]

    API --> ANALYTICS[Analytics Service]

    API --> AUDIT[Audit Service]

    BOOK --> DB[(PostgreSQL / Supabase)]

    SPACE --> DB

    TWIN --> DB

    NOTIF --> DB

    ANALYTICS --> DB

    AUDIT --> DB

    DB --> RT[Realtime Subscriptions]

    RT --> UI

    NOTIF --> EMAIL[Email Provider]

    AI --> LLM[AI Provider / Local AI Layer]

    API --> FUTURE[Future Integrations: CDVI, Hager, Philips]

## 18.2 Stack recommandée

| **Couche** | **Recommandation** | **Justification** |
| --- | --- | --- |
| Frontend | React / Next.js | Vercel ready, PWA, composants riches |
| Backend | Supabase Edge Functions ou API Next.js | Rapidité, intégration auth/data |
| Base | PostgreSQL / Supabase | Relationnel, RLS, realtime |
| Auth | Supabase Auth + SSO futur | RBAC et intégration entreprise |
| Realtime | Supabase Realtime | Occupation live |
| SVG | SVG natif + état applicatif | Performance, précision |
| IA | Service AI séparé | Évolutivité, sécurité |
| Déploiement | Vercel + Supabase + Docker optionnel | Cloud ready |

## 18.3 Principes Clean Architecture

### Diagramme Mermaid

flowchart LR

    UI[Presentation Layer] --> APP[Application Use Cases]

    APP --> DOMAIN[Domain Model]

    APP --> PORTS[Ports / Interfaces]

    PORTS --> INFRA[Infrastructure Adapters]

    INFRA --> DB[(Database)]

    INFRA --> MAIL[Email]

    INFRA --> AI[AI Provider]

    INFRA --> EXT[Future External Systems]

## 18.4 Domain Driven Design

| **Bounded Context** | **Responsabilité** |
| --- | --- |
| Identity & Access | Utilisateurs, rôles, permissions |
| Spaces | Bâtiments, zones, clusters, postes |
| Reservations | Réservations, approbations, waiting list |
| Occupancy | Check-in, check-out, no-show, présence |
| Digital Twin | SVG, interaction, mapping spatial |
| Notifications | Emails, in-app, rappels |
| Analytics | KPI, tendances, exports |
| AI Assistant | Recommandations, prédictions, analyses |
| Audit | Logs et traçabilité |

# 19. Modèle conceptuel de données

## 19.1 ERD Mermaid

### Diagramme Mermaid

erDiagram

    USER ||--o{ USER_ROLE : has

    ROLE ||--o{ USER_ROLE : assigned

    ROLE ||--o{ ROLE_PERMISSION : includes

    PERMISSION ||--o{ ROLE_PERMISSION : grants

    BUILDING ||--o{ FLOOR : contains

    FLOOR ||--o{ SPACE : contains

    SPACE ||--o{ CLUSTER : contains

    CLUSTER ||--o{ WORKSTATION : contains

    WORKSTATION ||--o{ RESERVATION : booked

    USER ||--o{ RESERVATION : creates

    RESERVATION ||--o{ APPROVAL_REQUEST : may_require

    USER ||--o{ APPROVAL_REQUEST : approves

    RESERVATION ||--o{ CHECK_EVENT : has

    RESERVATION ||--o{ NOTIFICATION : triggers

    RESERVATION ||--o{ WAITING_LIST_ENTRY : relates

    SPACE ||--o{ DIGITAL_TWIN_OBJECT : mapped

    WORKSTATION ||--|| DIGITAL_TWIN_OBJECT : visualized_by

    USER ||--o{ AUDIT_LOG : performs

    BUILDING {

        uuid id

        string name

        string code

        boolean active

    }

    FLOOR {

        uuid id

        uuid building_id

        string name

        int level

    }

    SPACE {

        uuid id

        uuid floor_id

        string name

        string type

        boolean active

    }

    CLUSTER {

        uuid id

        uuid space_id

        string name

        boolean management_reserved

        boolean enabled

    }

    WORKSTATION {

        uuid id

        uuid cluster_id

        string code

        string status

        boolean reservable

        jsonb metadata

    }

    RESERVATION {

        uuid id

        uuid workstation_id

        uuid user_id

        timestamp start_at

        timestamp end_at

        string type

        string status

        boolean requires_approval

    }

## 19.2 Tables principales

| **Table** | **Objet** | **Remarques** |
| --- | --- | --- |
| users | Utilisateurs | Peut être lié à Supabase Auth |
| roles | Rôles | Profils standards |
| permissions | Permissions | Granularité fonctionnelle |
| user_roles | Affectation | Multi-rôle possible |
| buildings | Bâtiments | Préparation multi-bâtiment |
| floors | Niveaux | RDC initial |
| spaces | Espaces | Open Space initial |
| clusters | Clusters | 7 initiaux |
| workstations | Postes | 28 initiaux |
| reservations | Réservations | Coeur métier |
| approval_requests | Approbations | Longue durée, clusters |
| check_events | Check-in/out | Occupation réelle |
| waiting_list_entries | Liste d'attente | FIFO |
| notifications | Notifications | In-app/email |
| audit_logs | Audit | Traçabilité |
| digital_twin_objects | Mapping SVG | Liaison visuel/donnée |
| settings | Paramètres | Durée max, no-show, horaires |

# 20. Exigences API

## 20.1 Principes API

API first.

JSON standard.

Authentification obligatoire.

RBAC appliqué côté serveur.

Pagination pour listes.

Filtres explicites.

Idempotence sur actions sensibles lorsque nécessaire.

Audit automatique pour mutations critiques.

## 20.2 Endpoints principaux

| **Méthode** | **Endpoint** | **Description** | **Rôle minimal** |
| --- | --- | --- | --- |
| GET | /api/me | Profil connecté | Authentifié |
| GET | /api/spaces/open-space | Détails Open Space | Employee |
| GET | /api/workstations | Liste postes | Employee |
| GET | /api/workstations/:id | Détail poste | Employee |
| POST | /api/reservations | Créer réservation | Employee |
| GET | /api/reservations | Lister réservations | Employee |
| PATCH | /api/reservations/:id/cancel | Annuler | Owner/Admin |
| POST | /api/reservations/:id/check-in | Check-in | Owner/Reception |
| POST | /api/reservations/:id/check-out | Check-out | Owner/Reception |
| POST | /api/approvals/:id/approve | Approuver | EA/Director |
| POST | /api/approvals/:id/reject | Refuser | EA/Director |
| GET | /api/dashboard/open-space | KPI | Manager |
| GET | /api/audit-logs | Logs | Admin/Security |
| GET | /api/digital-twin/open-space | SVG metadata | Employee |
| POST | /api/ai/ask | Question IA | Selon droits |

## 20.3 Contrat création réservation

### Bloc JSON

{

  "workstationId": "uuid",

  "startAt": "2026-07-14T08:00:00Z",

  "endAt": "2026-07-14T12:00:00Z",

  "type": "HALF_DAY",

  "purpose": "Workshop preparation"

}

## 20.4 Réponses types

### Réservation confirmée

### Bloc JSON

{

  "reservationId": "uuid",

  "status": "CONFIRMED",

  "requiresApproval": false,

  "checkInDeadline": "2026-07-14T08:30:00Z"

}

### Approbation requise

### Bloc JSON

{

  "reservationId": "uuid",

  "status": "PENDING_APPROVAL",

  "requiresApproval": true,

  "approvalType": "LONG_DURATION"

}

# 21. Spécification du Digital Twin SVG

## 21.1 Objectif

Le Digital Twin SVG doit fournir une représentation interactive, fidèle et exploitable de l'Open Space. Il doit permettre aux utilisateurs de comprendre l'organisation spatiale, de visualiser les statuts et de réserver les postes.

## 21.2 Objets à représenter

| **Objet** | **Représentation** | **Interaction** |
| --- | --- | --- |
| Murs | Formes fixes | Aucune |
| Circulation | Zones visuelles | Hover informationnel |
| Entrées | Icônes/portes | Tooltip |
| Postes | Objets cliquables | Hover, click, sélection |
| Clusters | Groupes visuels | Filtre, highlight |
| Zones collaboratives | Zones SVG | Tooltip |
| Équipements | Icônes | Préparation module équipements |
| Imprimantes | Icône | Tooltip |
| Displays | Icône | Tooltip |
| Zones désactivées | Pattern ou opacité | Non réservable |

## 21.3 États visuels

| **État** | **Couleur recommandée** | **Signification** |
| --- | --- | --- |
| Disponible | Vert | Réservable |
| Réservé | Bleu | Réservé mais pas check-in |
| Occupé | Rouge / bordeaux | Check-in effectué |
| No-show | Orange | Réservation non honorée |
| Désactivé | Gris | Non réservable |
| Management | Violet sobre ou contour spécifique | Autorisation spéciale |
| Maintenance | Jaune | Indisponible temporairement |

## 21.4 Interactions

### Diagramme Mermaid

sequenceDiagram

    participant U as Utilisateur

    participant UI as Digital Twin UI

    participant API as API

    participant DB as Database

    U->>UI: Ouvre Open Space

    UI->>API: GET digital twin + occupation

    API->>DB: Lire postes, clusters, statuts

    DB-->>API: Données

    API-->>UI: SVG metadata + status

    U->>UI: Hover poste

    UI-->>U: Tooltip disponibilité

    U->>UI: Click poste disponible

    UI->>API: Vérifier disponibilité

    API-->>UI: OK

    UI-->>U: Ouvrir panneau réservation

## 21.5 Exigences techniques SVG

Chaque poste doit avoir un identifiant stable : desk-001, desk-002, etc.

Chaque cluster doit avoir un identifiant stable : cluster-01.

Les objets SVG doivent être mappés à la base via digital_twin_objects.

Le plan doit supporter zoom et pan sans perte de lisibilité.

Les états doivent être pilotés par données et non codés en dur.

Les objets non réservables doivent rester visibles mais inactifs.

# 22. Spécification du XFactory AI Assistant

## 22.1 Positionnement

Le XFactory AI Assistant n'est pas un chatbot générique. C'est un assistant intelligent intégré à la plateforme, orienté recommandation, analyse, détection et aide à la décision.

## 22.2 Capacités attendues

| **Capacité** | **Description** | **Acteurs** |
| --- | --- | --- |
| Recommandation de poste | Suggérer un poste selon préférences, disponibilité, historique | Employee |
| Prédiction d'occupation | Anticiper les pics par jour/heure | Managers |
| Détection anomalies | Identifier réservations abusives ou répétitives | Admin |
| Analyse usage | Expliquer tendances et sous-utilisation | Managers |
| Questions en langage naturel | Répondre aux questions sur occupation | Managers |
| Génération rapports | Produire synthèses hebdo/mensuelles | Admin |
| Optimisation clusters | Recommander réorganisation | GCI/Building Manager |
| Assistance admin | Aider à comprendre erreurs et configurations | Admin |
| Apprentissage habitudes | Adapter suggestions aux usages | Employee |

## 22.3 Exemples de questions

"Quels clusters sont les plus utilisés cette semaine ?"

"Quel est le taux de no-show du mois ?"

"Recommande-moi un poste calme pour demain matin."

"Quels postes sont souvent réservés mais peu check-in ?"

"Prépare un rapport d'occupation pour la direction."

## 22.4 Architecture IA

### Diagramme Mermaid

flowchart TB

    UI[AI Assistant UI] --> API[AI Assistant API]

    API --> AUTH[RBAC Context]

    API --> RETRIEVE[Data Retrieval Layer]

    RETRIEVE --> DB[(Operational DB)]

    RETRIEVE --> ANALYTICS[(Analytics Views)]

    API --> POLICY[Security & Prompt Policy]

    POLICY --> MODEL[AI Model]

    MODEL --> API

    API --> UI

    API --> AUDIT[AI Interaction Audit]

## 22.5 Règles de sécurité IA

L'assistant ne doit répondre qu'à partir des données autorisées par le rôle.

L'assistant ne doit pas exposer des données nominatives sensibles aux profils non autorisés.

Toute génération de rapport doit être journalisée.

Les recommandations doivent être explicables.

L'assistant doit signaler les limites de confiance en cas de données insuffisantes.

# 23. Spécification du dashboard exécutif

## 23.1 Objectif

Le dashboard doit permettre aux décideurs et gestionnaires de piloter l'Open Space selon des indicateurs fiables, lisibles et actionnables.

## 23.2 KPI obligatoires

| **KPI** | **Définition** | **Fréquence** |
| --- | --- | --- |
| Occupancy Rate | Heures occupées / heures disponibles | Temps réel + période |
| Available Workstations | Postes disponibles maintenant | Temps réel |
| Reserved Workstations | Postes réservés | Temps réel |
| Peak Hours | Heures de plus forte demande | Hebdo/mensuel |
| Heat Map | Intensité d'usage par poste/cluster | Période |
| Cluster Usage | Taux d'usage par cluster | Période |
| No Shows | Réservations non honorées | Jour/semaine/mois |
| Reservation Trends | Évolution des réservations | Hebdo/mensuel/annuel |
| User Statistics | Utilisateurs actifs | Période |
| Department Statistics | Usage par département | Période |
| AI Predictions | Prévisions d'occupation | Semaine à venir |

## 23.3 Wireframe logique

### Diagramme Mermaid

flowchart TB

    A[Header: période, filtres, export] --> B[KPI Cards: occupation, disponible, réservé, no-show]

    B --> C[Heat Map Open Space]

    B --> D[Courbe tendances réservations]

    C --> E[Usage par cluster]

    D --> F[Peak hours]

    E --> G[Statistiques utilisateurs/départements]

    F --> H[AI Predictions & recommandations]

## 23.4 Exports

Export PDF du dashboard.

Export Excel des données agrégées.

Export CSV optionnel pour analyse.

# 24. Système de notifications

## 24.1 Canaux

| **Canal** | **Usage** |
| --- | --- |
| In-app | Notifications opérationnelles |
| Email | Confirmation, approbation, annulation |
| Push PWA futur | Rappels check-in |

## 24.2 Événements

| **Événement** | **Destinataire** | **Canal** |
| --- | --- | --- |
| Réservation confirmée | Utilisateur | In-app + email |
| Approbation requise | Approbateur | In-app + email |
| Approbation acceptée | Utilisateur | In-app + email |
| Approbation refusée | Utilisateur | In-app + email |
| Rappel check-in | Utilisateur | In-app + futur push |
| No-show | Utilisateur + admin selon config | In-app |
| Poste libéré | Liste d'attente | In-app + email |

# 25. Sécurité applicative

## 25.1 Exigences de sécurité

| **Domaine** | **Exigence** |
| --- | --- |
| Authentification | Sessions sécurisées, SSO futur |
| Autorisation | RBAC côté serveur |
| Données | Chiffrement en transit |
| Base | Row Level Security si Supabase |
| API | Rate limiting, validation stricte |
| Audit | Logs non modifiables |
| IA | Contexte filtré par permissions |
| Exports | Accès restreint et journalisé |

## 25.2 Menaces principales

| **Menace** | **Mitigation** |
| --- | --- |
| Réservation non autorisée | RBAC serveur |
| Accès aux données d'autrui | RLS + scopes |
| Injection API | Validation schémas |
| Abus de réservation | Limites, approbation, audit |
| Exfiltration via IA | Filtrage contexte |
| Session volée | Expiration, tokens sécurisés |

# 26. Audit logs et traçabilité

## 26.1 Actions à journaliser

Connexion utilisateur.

Création, modification, annulation de réservation.

Check-in/check-out.

No-show automatique.

Approbation/refus.

Changement de rôle.

Modification de paramètres.

Activation cluster management.

Export de données.

Requête IA sensible.

## 26.2 Structure d'un log

| **Champ** | **Description** |
| --- | --- |
| id | Identifiant |
| actor_id | Utilisateur |
| action | Type d'action |
| entity_type | Entité concernée |
| entity_id | Identifiant entité |
| before | État avant |
| after | État après |
| ip_address | IP |
| user_agent | Navigateur |
| created_at | Horodatage |

# 27. Gestion des erreurs

| **Code** | **Cas** | **Message utilisateur** | **Action** |
| --- | --- | --- | --- |
| ERR_AUTH_REQUIRED | Non connecté | Veuillez vous reconnecter | Redirection login |
| ERR_FORBIDDEN | Permission manquante | Accès non autorisé | Log sécurité |
| ERR_DESK_UNAVAILABLE | Poste indisponible | Ce poste n'est plus disponible | Proposer alternatives |
| ERR_APPROVAL_REQUIRED | Durée longue | Cette réservation nécessite une approbation | Créer workflow |
| ERR_CHECKIN_EXPIRED | Check-in trop tard | La réservation a été classée No Show | Afficher postes libres |
| ERR_CLUSTER_LOCKED | Cluster management bloqué | Autorisation requise | Demande autorisation |
| ERR_NETWORK | Perte réseau | Connexion instable | Retry |
| ERR_AI_UNAVAILABLE | Assistant indisponible | Assistant temporairement indisponible | Log technique |

# 28. Description des écrans et wireframes

## 28.1 Login

Objectif : permettre l'accès sécurisé.

Éléments : logo XFactory OS, email, mot de passe, bouton connexion, récupération mot de passe.

Validation : champs obligatoires, message d'erreur clair.

Accessibilité : labels, navigation clavier.

## 28.2 Dashboard exécutif

Objectif : piloter l'occupation.

Éléments : KPI cards, heatmap, tendances, cluster usage, no-shows, export PDF/Excel, prédictions IA.

Rôles : Direction, GCI Manager, Building Manager, Admin.

## 28.3 Digital Twin Open Space

Objectif : réserver visuellement.

Éléments : plan SVG, zoom, pan, filtres, légende, tooltip poste, panneau réservation.

Interaction : clic poste disponible ouvre le panneau de réservation.

## 28.4 Panneau réservation

Objectif : confirmer une réservation.

Éléments : poste sélectionné, cluster, date, type, durée, règles, bouton confirmer.

Validation : disponibilité, durée, droits.

## 28.5 Mes réservations

Objectif : suivre ses réservations.

Éléments : liste, statut, check-in, check-out, annulation, historique.

Règles : check-in disponible seulement dans la fenêtre autorisée.

## 28.6 Calendrier

Objectif : visualiser réservations par période.

Éléments : vues jour/semaine/mois, filtres cluster, statuts couleur.

Rôles : tous selon périmètre.

## 28.7 Liste d'attente

Objectif : gérer la demande en cas de saturation.

Éléments : créneau, poste/cluster souhaité, rang, notification.

Règle : FIFO.

## 28.8 Gestion des postes

Objectif : administrer les postes.

Éléments : tableau postes, statut, cluster, position SVG, maintenance, historique.

Rôles : Admin, Building Manager.

## 28.9 Gestion des clusters

Objectif : administrer les clusters.

Éléments : liste clusters, postes associés, management reserved, activation.

Règle : clusters management désactivés par défaut.

## 28.10 Gestion utilisateurs

Objectif : administrer les comptes.

Éléments : liste, recherche, rôle, département, statut, import.

Rôles : Super Admin, Admin.

## 28.11 Gestion rôles et permissions

Objectif : configurer le RBAC.

Éléments : rôles, permissions par domaine, matrice, audit.

Rôle : Super Admin.

## 28.12 Paramètres

Objectif : configurer les règles.

Éléments : durée max, délai no-show, horaires, jours ouvrés, notifications.

Rôle : Admin.

## 28.13 Audit logs

Objectif : consulter la traçabilité.

Éléments : filtres, acteur, action, entité, date, export.

Rôles : Super Admin, Security, IT Admin.

## 28.14 Assistant IA

Objectif : assistance intelligente.

Éléments : champ question, suggestions, cartes recommandations, explication, actions rapides.

Règle : réponses filtrées selon permissions.

# 29. Exigences non fonctionnelles

| **ID** | **Domaine** | **Exigence** | **Cible** |
| --- | --- | --- | --- |
| NFR-01 | Performance | Chargement dashboard | < 3 s |
| NFR-02 | Performance | Recherche postes | < 500 ms |
| NFR-03 | Performance | Refresh occupation | < 2 s |
| NFR-04 | Scalabilité | Utilisateurs | 10 000+ |
| NFR-05 | Scalabilité | Postes | extensible multi-bâtiment |
| NFR-06 | Disponibilité | Plateforme | 99,5 % cible initiale |
| NFR-07 | Sécurité | RBAC serveur | obligatoire |
| NFR-08 | Audit | Actions critiques | 100 % journalisées |
| NFR-09 | Accessibilité | WCAG | AA cible |
| NFR-10 | Responsive | Desktop/tablette/mobile | obligatoire |
| NFR-11 | PWA | Installation future | ready |
| NFR-12 | Offline | Consultation partielle | future |
| NFR-13 | Maintenabilité | Architecture modulaire | obligatoire |
| NFR-14 | Extensibilité | Nouveaux modules | sans refonte majeure |
| NFR-15 | Cloud ready | Vercel/Supabase | compatible |
| NFR-16 | Docker ready | Environnement local | compatible |
| NFR-17 | Monitoring | Logs techniques | obligatoire |
| NFR-18 | Observabilité | Erreurs et métriques | dashboard technique |

# 30. Critères d'acceptation

## 30.1 Critères globaux

Un utilisateur peut se connecter.

Le menu affiché dépend de son rôle.

L'Open Space apparaît sous forme de Digital Twin SVG.

Les 28 postes et 7 clusters sont visibles.

Un poste disponible peut être réservé.

Une réservation normale est confirmée sans validation manager.

Une réservation dépassant la durée maximale demande approbation.

Seuls Executive Assistant et Director peuvent approuver une longue durée.

Deux clusters management sont désactivés par défaut.

Seuls GCI Manager et Building Manager peuvent autoriser ces clusters.

Le check-in est obligatoire.

Après 30 minutes sans check-in, le statut devient no-show.

Le poste redevient disponible après no-show.

Les KPI clés sont visibles.

Les actions critiques sont journalisées.

Les exports PDF/Excel du dashboard sont disponibles.

## 30.2 Definition of Done

| **Élément** | **Condition** |
| --- | --- |
| Code | Revu, testé, documenté |
| Tests | Unitaires + intégration + E2E critiques |
| Sécurité | RBAC vérifié côté serveur |
| UX | Responsive et accessible |
| Performance | Critères NFR respectés |
| Données | Migrations validées |
| Documentation | Technique et utilisateur |
| Déploiement | Environnement staging opérationnel |

# 31. Stratégie de tests

## 31.1 Tests fonctionnels

| **Domaine** | **Tests** |
| --- | --- |
| Auth | Connexion, session expirée, compte inactif |
| RBAC | Menus, actions interdites, permissions |
| Réservation | FIFO, conflit, multi-jours, approbation |
| Check-in/out | Fenêtre 30 min, no-show, libération |
| Digital Twin | Click, hover, zoom, pan, statuts |
| Dashboard | KPI, filtres, exports |
| Notifications | Confirmation, rappel, approbation |
| Audit | Logs générés |

## 31.2 Tests techniques

Tests unitaires services métier.

Tests d'intégration API/base.

Tests E2E des workflows critiques.

Tests de performance sur Digital Twin.

Tests de sécurité RBAC.

Tests de charge sur consultations dashboard.

Tests responsive desktop/tablette/mobile.

Tests accessibilité clavier et lecteurs d'écran.

## 31.3 Scénarios E2E prioritaires

Réservation standard demi-journée.

Réservation longue avec approbation.

No-show automatique.

Autorisation cluster management.

Liste d'attente après saturation.

Export dashboard.

Tentative d'accès non autorisée.

# 32. Stratégie de déploiement

## 32.1 Environnements

| **Environnement** | **Usage** |
| --- | --- |
| Local | Développement |
| Dev | Intégration équipe |
| Staging | Validation métier |
| Production | Exploitation |

## 32.2 Déploiement cible

### Diagramme Mermaid

flowchart LR

    DEV[Developer] --> GIT[Git Repository]

    GIT --> CI[CI/CD]

    CI --> TEST[Automated Tests]

    TEST --> STAGING[Staging Vercel]

    STAGING --> APPROVAL[Business Validation]

    APPROVAL --> PROD[Production Vercel]

    PROD --> SUPA[(Supabase Production)]

    PROD --> MON[Monitoring]

## 32.3 Vercel Ready

Build Next.js.

Variables d'environnement séparées.

Preview deployments.

Rollback rapide.

## 32.4 Supabase Ready

Migrations SQL versionnées.

RLS activée.

Policies testées.

Backups configurés.

Realtime activé sur tables nécessaires.

## 32.5 Docker Ready

Dockerfile applicatif.

Compose local avec base si nécessaire.

Scripts seed data.

# 33. Roadmap vers XFactory OS complet

## Phase 1 - Module Open Space

Digital Twin Open Space.

Réservation postes.

Check-in / no-show.

RBAC.

Dashboard Open Space.

IA initiale.

## Phase 2 - Salles et espaces collaboratifs

Réservation salles.

Règles de validation Growth Culture & Collaborative Innovation.

Synchronisation écrans Philips.

Capacité minimale participants.

Calendrier salles.

## Phase 3 - Le Bijou et gouvernance exécutive

Réservation contrôlée.

Validation spécifique Direction/GCI.

Confidentialité.

Accès CDVI Centaur.

## Phase 4 - Visitors

Pré-enregistrement visiteurs.

Workflow réception.

Badges temporaires.

Notifications hôtes.

Journal sécurité.

## Phase 5 - Equipment Management

Inventaire global.

Équipements par salle.

Cycle de vie.

Maintenance status.

Affectation aux espaces.

## Phase 6 - Services & Support

Facility Management.

Nettoyage.

Incidents.

Demandes support.

SLA.

## Phase 7 - Analytics global et Digital Twin bâtiment

Occupation multi-espaces.

Heatmap bâtiment.

Prédiction de charge.

Optimisation capacité.

Rapports direction.

## Phase 8 - Intégrations avancées

CDVI Centaur.

Hager services bâtiment.

Philips room displays.

Microsoft 365 / Google Workspace.

IoT sensors.

# 34. Conclusion

Le module Smart Open Space Management doit être conçu comme le premier socle industriel de XFactory OS. Sa réussite ne dépendra pas uniquement de la possibilité de réserver un poste, mais de sa capacité à structurer un modèle d'usage fiable, mesurable, gouverné et extensible.

La plateforme doit offrir une expérience utilisateur simple, comparable à la sélection d'un siège, tout en intégrant des mécanismes d'entreprise : RBAC, audit, workflow d'approbation, analytics, Digital Twin, IA, sécurité, scalabilité et préparation multi-module.

En mettant en place ce module, XFactory pose les fondations d'un système plus large : une plateforme Smart Building capable de piloter progressivement les espaces, les visiteurs, les équipements, les services, les accès, les tableaux de bord et l'intelligence opérationnelle du bâtiment.

Le développement doit donc être réalisé avec une exigence d'architecture produit, et non comme une application isolée. Chaque décision technique doit préparer l'évolution vers XFactory OS complet.