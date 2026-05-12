#!/usr/bin/env python3
"""
Create OversightOntology.owl — OWL 2 DL realization of the Domain Constitution.

Translates the SHOIQ TBox from Section 3 of the bridge paper into an executable
OWL ontology. Run with: python create_ontology.py

Produces: OversightOntology.owl (RDF/XML) and OversightOntology.owx (OWL/XML)
"""

from owlready2 import *
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))
OWL_FILE = os.path.join(OUTPUT_DIR, "OversightOntology.owl")

onto = get_ontology("http://legal.org.ua/ontology/oversight#")

with onto:

    # ==================================================================
    #  Atomic Concepts (Definition 3.1 — Signature)
    # ==================================================================

    class Agent(Thing):
        """LLM-based agentic system."""
        pass

    class Human(Thing):
        """Practitioner performing oversight."""
        pass

    class Session(Thing):
        """Bounded unit of human-agent interaction."""
        pass

    class Artifact(Thing):
        """Output produced by Agent within a Session."""
        pass

    class Edit(Thing):
        """Human correction applied to an Artifact."""
        pass

    class Outcome(Thing):
        """Deployed result with measurable consequences."""
        pass

    class State(Thing):
        """Persistent shared computational state."""
        pass

    class Information(Thing):
        """Knowledge or context available to a participant."""
        pass

    class SuccessCriterion(Thing):
        """Observable predicate defining task completion."""
        pass

    class ProductionMetric(Thing):
        """Measurable system-level quantity."""
        pass

    class Workflow(Thing):
        """Sequence of sessions composing a shipping operation."""
        pass

    # ==================================================================
    #  Object Properties (Role names from Signature)
    # ==================================================================

    class operatesOn(ObjectProperty):
        domain = [Agent]
        range = [State]

    class isOperatedOnBy(ObjectProperty):
        domain = [State]
        range = [Agent]
        inverse_property = operatesOn

    class accessesState(ObjectProperty):
        domain = [Human]
        range = [State]

    class isAccessedBy(ObjectProperty):
        domain = [State]
        range = [Human]
        inverse_property = accessesState

    class producesArtifact(ObjectProperty):
        domain = [Session]
        range = [Artifact]

    class hasEdit(ObjectProperty):
        domain = [Artifact]
        range = [Edit]

    class hasOutcome(ObjectProperty):
        domain = [Session]
        range = [Outcome]

    class dependsOn(ObjectProperty, TransitiveProperty):
        domain = [Session]
        range = [Session]

    class basedOn(ObjectProperty):
        domain = [Edit]
        range = [Information]

    class accessibleTo(ObjectProperty):
        domain = [Information]
        range = [Agent]

    class hasCriterion(ObjectProperty):
        domain = [Session]
        range = [SuccessCriterion]

    class measuredBy(ObjectProperty):
        domain = [SuccessCriterion]
        range = [ProductionMetric]

    class hasConsequence(ObjectProperty):
        domain = [Outcome]
        range = [ProductionMetric]

    class partOf(ObjectProperty):
        domain = [Session]
        range = [Workflow]

    class hasSession(ObjectProperty):
        domain = [Workflow]
        range = [Session]

    class hasState(ObjectProperty):
        domain = [Session]
        range = [State]

    class hasArtifact(ObjectProperty):
        domain = [Session]
        range = [Artifact]

    # ==================================================================
    #  Derived Concepts (Equations 1-4)
    # ==================================================================

    class PersistentState(State):
        """State accessed by both Agent (operatesOn^-) and Human (accessesState^-)."""
        equivalent_to = [
            State
            & isOperatedOnBy.some(Agent)
            & isAccessedBy.some(Human)
        ]

    class PrivateInfo(Information):
        """Information NOT accessible to any Agent.
        Under OWA, individuals must be explicitly closed:
        assert accessibleTo.max(0, Agent) to trigger classification."""
        equivalent_to = [
            Information & accessibleTo.max(0, Agent)
        ]

    class GroundedCriterion(SuccessCriterion):
        """Success criterion measured by a production metric."""
        equivalent_to = [
            SuccessCriterion & measuredBy.some(ProductionMetric)
        ]

    class ConsequentialOutcome(Outcome):
        """Outcome with measurable real-world consequences."""
        equivalent_to = [
            Outcome & hasConsequence.some(ProductionMetric)
        ]

    # ==================================================================
    #  Condition Classes (C1-C5) — for graded classification
    # ==================================================================

    class SatisfiesC1(Thing):
        """Session with shared persistent state."""
        equivalent_to = [hasState.some(PersistentState)]

    class SatisfiesC2(Thing):
        """Session that is part of a compositional workflow."""
        equivalent_to = [
            partOf.some(
                Workflow & hasSession.some(
                    Session & dependsOn.some(Session)
                )
            )
        ]

    class SatisfiesC3(Thing):
        """Session with grounded success criteria."""
        equivalent_to = [hasCriterion.some(GroundedCriterion)]

    class SatisfiesC4(Thing):
        """Session with edits based on private information."""
        equivalent_to = [
            hasArtifact.some(
                Artifact & hasEdit.some(
                    Edit & basedOn.some(PrivateInfo)
                )
            )
        ]

    class SatisfiesC5(Thing):
        """Session with consequential outcomes."""
        equivalent_to = [hasOutcome.some(ConsequentialOutcome)]

    # ==================================================================
    #  ValidOversight — conjunction of all five conditions
    # ==================================================================

    class ValidOversight(Thing):
        """Workflow session satisfying all five domain constitution conditions."""
        equivalent_to = [
            SatisfiesC1 & SatisfiesC2 & SatisfiesC3 & SatisfiesC4 & SatisfiesC5
        ]

    # ==================================================================
    #  Graded Classification (Definition 3.8)
    # ==================================================================

    class FullOversight(Thing):
        """gamma = 5: all conditions satisfied."""
        equivalent_to = [ValidOversight]

    class PartialOversight(Thing):
        """gamma in {3,4}: most conditions satisfied but not all."""
        pass  # Defined programmatically during classification

    class InvalidOversight(Thing):
        """gamma <= 2: insufficient conditions."""
        pass  # Defined programmatically during classification

    # ==================================================================
    #  OntoChatGPT Control concept (for subsumption test, Section 4)
    # ==================================================================

    class OntoChatGPT_Control(Thing):
        """Ontology-driven control of LLM output generation (Palagin et al. 2023).
        Satisfies C1 (persistent ontology state) and partially C3 (domain grounding),
        but not C4 (no human information asymmetry) or C5 (no production deployment)."""
        equivalent_to = [
            SatisfiesC1 & SatisfiesC3
        ]


# ==================================================================
#  Save ontology
# ==================================================================
onto.save(file=OWL_FILE, format="rdfxml")
print(f"Ontology saved to: {OWL_FILE}")

# Print ontology metrics
classes = list(onto.classes())
props = list(onto.object_properties())
print(f"\nOntology metrics:")
print(f"  Named classes:       {len(classes)}")
print(f"  Object properties:   {len(props)}")
print(f"  Equivalent classes:  {sum(1 for c in classes if c.equivalent_to)}")
print(f"  Transitive roles:    {sum(1 for p in props if TransitiveProperty in p.is_a)}")

# Verify with HermiT
print(f"\nRunning HermiT reasoner...")
try:
    sync_reasoner_hermit(infer_property_values=False, debug=0)
    print("  TBox consistency: SATISFIABLE")
    inconsistent = list(onto.inconsistent_classes())
    if inconsistent:
        print(f"  Inconsistent classes: {inconsistent}")
    else:
        print("  Inconsistent classes: none")
    print("  Reasoning completed successfully.")
except Exception as e:
    print(f"  Reasoner error: {e}")
