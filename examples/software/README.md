# Report export: a synthetic software project

[English](README.md) | [Русский](README.ru.md)

This example connects requirements, decisions, diagram artifacts, an API contract, implementation tasks, planned tests and documentation. It was created from scratch: there are no real people, companies, authorities, locations or customer records.

Open [software-en.json](../../data/software-en.json) through PlyLoom's import command. In the updated app, choose **ENG → Project → Other formats and examples → Example: software** to load the complete English example. Loading an example replaces the current map and supports Undo; save your own project first.

The graph has **40 nodes, 75 relations and 8 sheets**. The API contract is one artifact on four sheets. A document, a diagram and the domain object they describe have different IDs. Sharing a node across sheets means the same object is being shown again.

## A three-minute walkthrough

1. On **Contracts and models**, select **API-01: export contract**. Use its sheet memberships to inspect the same artifact in Implementation, Verification and Documents and fragments.
2. On **Change review**, select **CHG-01: proposed two-hour expiry**. Follow the relation to REQ-03. Review the worker's expiry calculation, API authorization, cleanup task and TEST-03. These are candidates for review, not automatic impact conclusions.
3. On **Documents and fragments**, select **Fragment: result availability**. The user guide and runbook reference this same node. Edit its text and inspect its appearance on Change review. This updates the graph node; it does not rebuild external documents.
4. Export native PlyLoom JSON and reopen it to retain all sheets, identities and relations.

The baseline availability period is 24 hours after Ready; the proposal is two hours for new files. Both values are arbitrary teaching assumptions. The proposal remains unaccepted. Decide how existing files should be treated before implementing it.

## What the artifacts mean

[artifacts.md](artifacts.md) contains an API table and Mermaid sources for a component diagram, a sequence and a state model. The graph shows these diagrams as artifact cards. It does not provide native UML editing or execute the illustrated service.

Test cards are **plans**, not evidence of a running or tested backend. The traceability matrix is manual. The review packet is an ordered composition recipe, not an implemented CCMS publisher.

## Compatibility and provenance

`data/depot.json` remains a compatibility download path, but now contains the new Russian software example. Its former content and the old runtime name translations have been removed from this working version. This does not rewrite existing Git history, previously published releases or files already saved in a browser.

Change the UI language before loading the example to choose all of its text. Switching the UI language afterwards does not translate or overwrite authored bodies. RU and EN files preserve the same node IDs and topology.
