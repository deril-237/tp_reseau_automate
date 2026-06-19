// ─── Domain types ──────────────────────────────────────────────────────────────
export type Identifier = number;

export const StateEnum = {
  HEALTHY: 0,
  INFECTED: 1,
  RESTORED: 2,
} as const;

export type StateEnum = (typeof StateEnum)[keyof typeof StateEnum];

export interface IMachine {
  id: Identifier;
  state: StateEnum;
  ticksSinceInfection: number;
}

// ─── Network class ─────────────────────────────────────────────────────────────
export class Network {
  private probabilityOfInjection: number; // Worm virulence rate (β)
  private probabilityOfRestoration: number; // Recovery probability per tick (γ)
  private nbIteration: number = 0;
  private machines: Record<Identifier, IMachine>;
  private automaton: Record<Identifier, Identifier[]>; // Adjacency dictionary

  constructor(
    machines: Record<Identifier, IMachine>,
    automaton: Record<Identifier, Identifier[]>,
    probabilityOfInjection: number = 0.5,
    probabilityOfRestoration: number = 0.2,
  ) {
    this.machines = machines;
    this.automaton = automaton;
    this.probabilityOfInjection = probabilityOfInjection;
    this.probabilityOfRestoration = probabilityOfRestoration;
  }

  // ─── Getters ────────────────────────────────────────────────────────────────

  getMachines(): Readonly<Record<Identifier, IMachine>> {
    return this.machines;
  }

  getAutomaton(): Readonly<Record<Identifier, Identifier[]>> {
    return this.automaton;
  }

  getNbIteration(): number {
    return this.nbIteration;
  }

  getProbabilityOfInjection(): number {
    return this.probabilityOfInjection;
  }

  getProbabilityOfRestoration(): number {
    return this.probabilityOfRestoration;
  }

  // ─── Setters ────────────────────────────────────────────────────────────────

  setProbabilityOfInjection(value: number): void {
    this.probabilityOfInjection = value;
  }

  setProbabilityOfRestoration(value: number): void {
    this.probabilityOfRestoration = value;
  }

  // ─── Core simulation ────────────────────────────────────────────────────────

  /**
   * Retrieves the total count of infected neighbors for a given machine
   * based on a frozen snapshot of the network.
   */
  private getInfectedNeighborsCount(
    machineId: Identifier,
    snapshot: Record<Identifier, IMachine>,
  ): number {
    const neighbors = this.automaton[machineId] || [];
    let count = 0;
    for (const neighborId of neighbors) {
      if (
        snapshot[neighborId] &&
        snapshot[neighborId].state === StateEnum.INFECTED
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Calculates and applies state transitions across the entire network (t → t+1).
   */
  nextStep(): void {
    // 1. Immutable snapshot of the current state (time t)
    const snapshot: Record<Identifier, IMachine> = {};
    for (const id in this.machines) {
      snapshot[id] = { ...this.machines[id] };
    }

    // 2. Evaluate and evolve each machine to t+1
    for (const idStr in this.machines) {
      const id = Number(idStr) as Identifier;
      const currentMachine = this.machines[id];
      const machineSnapshot = snapshot[id];

      // TRANSITION: HEALTHY → INFECTED
      if (machineSnapshot.state === StateEnum.HEALTHY) {
        const n = this.getInfectedNeighborsCount(id, snapshot);
        if (n > 0) {
          // Cumulative probability: P(Infection) = 1 - (1 - β)^n
          const pInfection = 1 - Math.pow(1 - this.probabilityOfInjection, n);
          if (Math.random() < pInfection) {
            currentMachine.state = StateEnum.INFECTED;
            currentMachine.ticksSinceInfection = 0;
          }
        }
      }

      // TRANSITION: INFECTED → RESTORED
      else if (machineSnapshot.state === StateEnum.INFECTED) {
        currentMachine.ticksSinceInfection++;
        if (Math.random() < this.probabilityOfRestoration) {
          currentMachine.state = StateEnum.RESTORED;
        }
      }
      // RESTORED is an absorbing state — no transition needed.
    }

    this.nbIteration++;
  }

  // ─── Topology mutations ──────────────────────────────────────────────────────

  addNode(id: Identifier, state: StateEnum): void {
    this.machines[id] = { id, state, ticksSinceInfection: 0 };
    if (!this.automaton[id]) {
      this.automaton[id] = [];
    }
  }

  removeNode(id: Identifier): void {
    delete this.machines[id];
    delete this.automaton[id];
    // Remove all edges pointing to this node
    for (const neighborId in this.automaton) {
      this.automaton[neighborId] = this.automaton[neighborId].filter(
        (n) => n !== id,
      );
    }
  }

  addNeighbor(id: Identifier, neighbor: Identifier): void {
    if (!this.automaton[id]) this.automaton[id] = [];
    if (!this.automaton[neighbor]) this.automaton[neighbor] = [];

    if (!this.automaton[id].includes(neighbor)) {
      this.automaton[id].push(neighbor);
      this.automaton[neighbor].push(id); // Undirected graph
    }
  }

  removeNeighbor(id: Identifier, neighbor: Identifier): void {
    this.automaton[id] =
      this.automaton[id]?.filter((n) => n !== neighbor) ?? [];
    this.automaton[neighbor] =
      this.automaton[neighbor]?.filter((n) => n !== id) ?? [];
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────────

  getMetrics(): { HEALTHY: number; INFECTED: number; RESTORED: number } {
    const counts = { HEALTHY: 0, INFECTED: 0, RESTORED: 0 };
    for (const id in this.machines) {
      const state = this.machines[id].state;
      if (state === StateEnum.HEALTHY) counts.HEALTHY++;
      if (state === StateEnum.INFECTED) counts.INFECTED++;
      if (state === StateEnum.RESTORED) counts.RESTORED++;
    }
    return counts;
  }

  printMetrics(): void {
    const counts = this.getMetrics();
    console.log(
      `[Metrics] Healthy: ${counts.HEALTHY} | Infected: ${counts.INFECTED} | Restored: ${counts.RESTORED}`,
    );
  }

  // ─── Factory ──────────────────────────────────────────────────────────────────

  /**
   * Static factory: initializes a random network topology and states.
   * @param nodeCount         Total number of machines to create.
   * @param connectionProb    Probability [0, 1] that any two nodes are connected (Erdős-Rényi).
   * @param infectionRatio    Fraction [0, 1] of nodes starting as INFECTED.
   * @param beta              Worm virulence rate (β).
   * @param gamma             Recovery probability per tick (γ).
   */
  static initRandomNetwork(
    nodeCount: number,
    connectionProb: number = 0.3,
    infectionRatio: number = 0.1,
    beta: number = 0.5,
    gamma: number = 0.2,
  ): Network {
    const machines: Record<Identifier, IMachine> = {};
    const automaton: Record<Identifier, Identifier[]> = {};

    // 1. Initialize machines
    for (let i = 0; i < nodeCount; i++) {
      machines[i] = {
        id: i,
        state:
          Math.random() < infectionRatio
            ? StateEnum.INFECTED
            : StateEnum.HEALTHY,
        ticksSinceInfection: 0,
      };
      automaton[i] = [];
    }

    // 2. Spanning tree first (guarantees connectivity)
    const shuffled = [...Array(nodeCount).keys()].sort(
      () => Math.random() - 0.5,
    );
    for (let i = 1; i < shuffled.length; i++) {
      const a = shuffled[i];
      const b = shuffled[Math.floor(Math.random() * i)];
      automaton[a].push(b);
      automaton[b].push(a);
    }

    // 3. Extra random edges (Erdős-Rényi)
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        if (Math.random() < connectionProb && !automaton[i].includes(j)) {
          automaton[i].push(j);
          automaton[j].push(i);
        }
      }
    }

    return new Network(machines, automaton, beta, gamma);
  }
}
