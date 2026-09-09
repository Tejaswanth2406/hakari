import os
import json
import pandas as pd
import matplotlib.pyplot as plt

RESULTS_DIR = '../results'
PLOTS_DIR = '../results/plots'

if not os.path.exists(PLOTS_DIR):
    os.makedirs(PLOTS_DIR)

def plot_exp1_perturbation():
    path = os.path.join(RESULTS_DIR, 'exp1_perturbation.json')
    if not os.path.exists(path): return
    
    with open(path, 'r') as f:
        data = json.load(f)
    
    # Plot first trial for simplicity
    trial_data = data[0]['ticks']
    df = pd.DataFrame(trial_data)
    
    plt.figure(figsize=(10, 6))
    plt.plot(df['tick'], df['entropy'], label='Entropy (S)', color='red')
    plt.plot(df['tick'], df['avgStrength'], label='Avg Network Strength', color='blue')
    plt.axvline(x=2000, color='gray', linestyle='--', label='Perturbation Starts')
    plt.title('Experiment 1: Network Stability Under Progressive Perturbation')
    plt.xlabel('Simulation Ticks')
    plt.ylabel('Magnitude')
    plt.legend()
    plt.grid(True)
    plt.savefig(os.path.join(PLOTS_DIR, 'exp1_stability.png'))
    plt.close()

def plot_exp4_scalability():
    path = os.path.join(RESULTS_DIR, 'exp4_scalability.csv')
    if not os.path.exists(path): return
    
    df = pd.read_csv(path)
    # Group by nodes and take mean
    grouped = df.groupby('nodes').mean().reset_index()
    
    fig, ax1 = plt.subplots(figsize=(10, 6))
    
    ax1.set_xlabel('Node Count')
    ax1.set_ylabel('Avg Tick Time (ms)', color='tab:blue')
    ax1.plot(grouped['nodes'], grouped['avg_tick_ms'], marker='o', color='tab:blue')
    ax1.tick_params(axis='y', labelcolor='tab:blue')
    
    ax2 = ax1.twinx()
    ax2.set_ylabel('Final Heap Size (MB)', color='tab:red')
    ax2.plot(grouped['nodes'], grouped['final_heap_mb'], marker='s', color='tab:red')
    ax2.tick_params(axis='y', labelcolor='tab:red')
    
    fig.tight_layout()
    plt.title('Experiment 4: Computational Scalability')
    plt.savefig(os.path.join(PLOTS_DIR, 'exp4_scalability.png'))
    plt.close()

def plot_baseline():
    path = os.path.join(RESULTS_DIR, 'baseline_comparison.json')
    if not os.path.exists(path): return
    
    with open(path, 'r') as f:
        data = json.load(f)
        
    df = pd.DataFrame(data)
    
    x = df['nodes']
    width = 0.35
    
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(x - width/2 * 1000, df['baselineTickMs'], width * 1000, label='Baseline Graph Sim')
    ax.bar(x + width/2 * 1000, df['hakariTickMs'], width * 1000, label='HAKARI Framework')
    
    ax.set_ylabel('Avg Tick Time (ms)')
    ax.set_xlabel('Node Count')
    ax.set_title('Baseline Comparison: HAKARI Tick Overhead')
    ax.legend()
    plt.grid(axis='y')
    
    plt.savefig(os.path.join(PLOTS_DIR, 'baseline_comparison.png'))
    plt.close()

if __name__ == '__main__':
    print("Generating plots from benchmark results...")
    plot_exp1_perturbation()
    plot_exp4_scalability()
    plot_baseline()
    print(f"Plots saved to {PLOTS_DIR}")
