Here is a structural scaffold and architecture plan for the application. You can provide this directly to a coding agent to establish the foundation for a local-first, offline browser extension (like a Chrome Manifest V3 extension).

### **1\. Core Data Schema (JSON)**

The application relies on three static data structures to function offline without a database connection. These map the agent's baseline traits, the customer's real-time emotional state, and the intersection of the two.

JSON  
{  
  "agentProfiles": \[  
    {  
      "id": "sage",  
      "name": "The Sage (The Expert)",  
      "description": "Analytical, truth-seeking, relies on logic.",  
      "defaultEgoState": "Adult"  
    },  
    {  
      "id": "caregiver",  
      "name": "The Caregiver (The Harmonizer)",  
      "description": "Nurturing, selfless, focuses on emotional connection.",  
      "defaultEgoState": "Nurturing Parent"  
    }  
  \],  
  "customerProfiles": \[  
    {  
      "id": "distressed",  
      "name": "The Distressed",  
      "identifiers": \["Passive", "Overwhelmed", "Anxious", "Seeks confirmation"\],  
      "egoState": "Adapted Child"  
    },  
    {  
      "id": "demanding",  
      "name": "The Demanding",  
      "identifiers": \["Rigid", "Authoritative", "Uses absolutes like 'never'"\],  
      "egoState": "Critical Parent"  
    }  
  \],  
  "interactionMatrix": \[  
    {  
      "agentId": "sage",  
      "customerId": "distressed",  
      "risk": "Cold logic will alienate an emotional customer.",  
      "relateStrategy": "Force empathy before logic. Validate the emotion first.",  
      "phrasesToUse": \["I realize this whole thing has been frustrating for you."\],  
      "phrasesToAvoid": \["The data shows...", "Calm down."\]  
    },  
    {  
      "agentId": "caregiver",  
      "customerId": "demanding",  
      "risk": "May over-apologize and lose institutional authority.",  
      "relateStrategy": "Shift consciously to a highly structured, rational approach.",  
      "phrasesToUse": \["Here's what we know. Here's what we've done. Here's what's next."\],  
      "phrasesToAvoid": \["I apologize for any inconvenience.", "Let me try..."\]  
    }  
  \]  
}

### **2\. Application Component Flow**

To minimize the agent's cognitive load, the UI should be broken down into three distinct React or vanilla JavaScript components.

* **Onboarding View (\<AgentSetup /\>):** A one-time interface where the agent completes a short diagnostic based on the Process Communication Model and brand archetypes. Once the agent selects their natural response style, the application saves their agentId into the browser's local storage (e.g., chrome.storage.local).

* **Active Call View (\<CustomerQuickId /\>):** A persistent, lightweight floating menu used during the first 15 to 30 seconds of a call. It presents the 6 customer archetypes as quick-select buttons. These archetypes are mapped to Transactional Analysis markers, allowing the agent to quickly identify if the customer is operating from a Critical Parent, Adapted Child, or Adult ego state.

* **Guidance View (\<MatrixOutput /\>):** The dynamic output panel. When a customer type is clicked, this component reads the stored agentId, matches it with the selected customerId, and queries the interactionMatrix array.

### **3\. Logic and Heuristics Rules**

When instructing a coding agent on the business logic, emphasize that the application must forcefully filter out highly triggering phrases.  
The application logic must explicitly highlight phrases like "calm down," "that's our policy," or "I don't know" in the "Avoid" UI section, as these act as crossed transactions that escalate the situation by invalidating the customer's reality. Instead, the system must populate the "Relate" UI section with assertive optioning, collaborative questions, and empathy bridges to swiftly return the interaction to a rational, Adult-to-Adult exchange.

By structuring the application purely around local JSON arrays and the browser's native storage APIs, the code agent can build a highly responsive tool that requires zero network latency to operate.