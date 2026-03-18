# Knowledge Graph Service

**DPID:** DPID-KNW-GRP-001  
**Port:** 3085  
**Ecosystem:** SENTIENT

Semantic knowledge graph for the Trancendos Universe ontology. Stores and traverses relationships between all entities: Locations, Personas, Services, Pockets, Dimensionals, DPIDs.

## Pre-seeded Universe Ontology

- **23 Locations** (L01-L23) connected to Ecosystems + Pillars
- **7 Ecosystems** (NEXUS, PULSE, FORGE, GUARDIAN, SENTIENT, SOVEREIGN, TRANSIT)
- **6 Pillars** (PIL1-PIL6)
- **14 Services** with full dependency edges
- **6 Key Personas** (Madam Krystal, Cornelius, Penumbra, Lumi, Doris, Atlas)
- **30+ edges** encoding all known relationships

## Graph Model

Property Graph with typed edges:
`LOCATED_IN | BELONGS_TO | DEPENDS_ON | GOVERNS | COMMUNICATES_WITH | CREATED_BY | PART_OF | ENABLES | ROUTES_TO | EMBODIES`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Graph stats |
| GET | `/node/:nodeId` | Node + its edges |
| GET | `/nodes` | List/filter nodes |
| POST | `/node` | Add new node |
| POST | `/edge` | Add new edge |
| GET | `/traverse/:nodeId` | BFS traversal from node |
| GET | `/path/:from/:to` | Shortest path between nodes |
| GET | `/search` | Full-text search |
| GET | `/stats` | Graph statistics |
