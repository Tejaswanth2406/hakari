"""Dependency-light nonlinear dynamics laboratory for HAKARI."""

from .attractors import classify_attractor
from .bifurcation import scan_parameter
from .cellular_automata import step_automaton
from .criticality import avalanche_sizes
from .duffing import DuffingOscillator
from .fractal import box_counting_dimension
from .henon import HenonMap
from .kuramoto import kuramoto_step, order_parameter
from .logistic_map import logistic_step
from .lorenz import lorenz_step
from .lyapunov import largest_lyapunov
from .network_dynamics import network_step
from .pendulum import pendulum_step
from .percolation import percolates
from .reaction_diffusion import reaction_diffusion_step
from .recurrence import recurrence_matrix
from .replicator import replicator_step
from .rossler import rossler_step
from .stability import classify_linear_stability
from .stochastic import euler_maruyama_step
from .standard_map import standard_map_step
from .tent_map import tent_step
from .van_der_pol import van_der_pol_step

__all__ = [
    "classify_attractor", "scan_parameter", "step_automaton", "avalanche_sizes",
    "DuffingOscillator", "box_counting_dimension", "HenonMap", "kuramoto_step", "order_parameter",
    "logistic_step", "lorenz_step", "largest_lyapunov", "network_step",
    "pendulum_step", "percolates", "reaction_diffusion_step", "recurrence_matrix",
    "replicator_step", "rossler_step", "classify_linear_stability",
    "euler_maruyama_step", "standard_map_step", "tent_step", "van_der_pol_step",
]
