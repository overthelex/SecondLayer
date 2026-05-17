#!/usr/bin/env python3
"""
Spectral analysis: compute Fiedler value (algebraic connectivity) per period.
Tracks spectral gap evolution across consolidation→disruption→reorganization.
"""

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import eigsh
import csv
import json
import time
import os

DATADIR = "/tmp/citation-analysis"
PERIODS = [1, 2, 3, 4, 5]
LABELS = ["2007-13", "2014-16", "2017-19", "2020-21", "2022-26"]


def load_cocitation_graph(period):
    """Load cocitation edges and build sparse adjacency matrix."""
    path = os.path.join(DATADIR, f"fullscale_cocitation_p{period}.csv")
    print(f"[P{period}] Loading {path}...")
    t0 = time.time()

    nodes = set()
    edges = []
    with open(path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            a, b = row["node_a"], row["node_b"]
            w = float(row["weight_norm"])
            nodes.add(a)
            nodes.add(b)
            edges.append((a, b, w))

    node_list = sorted(nodes)
    node_idx = {n: i for i, n in enumerate(node_list)}
    n = len(node_list)

    print(f"[P{period}] {n} nodes, {len(edges)} edges, loading took {time.time()-t0:.1f}s")

    row_idx = []
    col_idx = []
    weights = []
    for a, b, w in edges:
        i, j = node_idx[a], node_idx[b]
        row_idx.extend([i, j])
        col_idx.extend([j, i])
        weights.extend([w, w])

    A = sparse.csr_matrix((weights, (row_idx, col_idx)), shape=(n, n))
    return A, n, len(edges)


def compute_spectral(A, n, k=10):
    """Compute smallest k eigenvalues of normalized Laplacian."""
    # Degree matrix
    degrees = np.array(A.sum(axis=1)).flatten()
    # Avoid division by zero
    degrees[degrees == 0] = 1.0
    D_inv_sqrt = sparse.diags(1.0 / np.sqrt(degrees))

    # Normalized Laplacian: L_norm = I - D^{-1/2} A D^{-1/2}
    I = sparse.eye(n)
    L_norm = I - D_inv_sqrt @ A @ D_inv_sqrt

    print(f"  Computing {k} smallest eigenvalues...")
    t0 = time.time()
    eigenvalues, _ = eigsh(L_norm, k=k, which="SM", tol=1e-6)
    eigenvalues = np.sort(eigenvalues)
    elapsed = time.time() - t0
    print(f"  Eigendecomposition: {elapsed:.1f}s")

    return eigenvalues


def main():
    results = []
    print("=" * 60)
    print("Spectral analysis: Fiedler value evolution")
    print("=" * 60)

    for p, label in zip(PERIODS, LABELS):
        print(f"\n--- Period {p} ({label}) ---")
        A, n, m = load_cocitation_graph(p)
        eigenvalues = compute_spectral(A, n, k=10)

        fiedler = eigenvalues[1]  # second-smallest = algebraic connectivity
        spectral_gap = eigenvalues[1] - eigenvalues[0]

        print(f"  λ₁ = {eigenvalues[0]:.6f}")
        print(f"  λ₂ (Fiedler) = {fiedler:.6f}")
        print(f"  λ₃ = {eigenvalues[2]:.6f}")
        print(f"  Spectral gap = {spectral_gap:.6f}")
        print(f"  Top 10 eigenvalues: {[f'{v:.6f}' for v in eigenvalues]}")

        results.append({
            "period": p,
            "label": label,
            "nodes": n,
            "edges": m,
            "fiedler": float(fiedler),
            "spectral_gap": float(spectral_gap),
            "eigenvalues": [float(v) for v in eigenvalues],
        })

        del A

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"{'Period':<12} {'Nodes':>8} {'Edges(M)':>10} {'Fiedler':>10} {'Gap':>10}")
    print("-" * 55)
    for r in results:
        print(f"{r['label']:<12} {r['nodes']:>8} {r['edges']/1e6:>10.1f} {r['fiedler']:>10.6f} {r['spectral_gap']:>10.6f}")

    with open(os.path.join(DATADIR, "spectral_results.json"), "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved to {DATADIR}/spectral_results.json")


if __name__ == "__main__":
    main()
