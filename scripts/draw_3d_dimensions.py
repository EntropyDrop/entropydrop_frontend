import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import numpy as np
import matplotlib as mpl
import matplotlib.font_manager as fm

# Set font to custom fusion-pixel font
font_path = "../public/fonts/fusion-pixel-12px-proportional-zh_hans.ttf"
fm.fontManager.addfont(font_path)
font_name = fm.FontProperties(fname=font_path).get_name()
mpl.rcParams['font.sans-serif'] = [font_name]
mpl.rcParams['axes.unicode_minus'] = False

fig = plt.figure(figsize=(15, 6))

def draw_3d_box(ax, origin, size, color, linestyle, label):
    x, y, z = origin
    dx, dy, dz = size
    
    # generate the 8 vertices
    vertices = np.array([
        [x, y, z],
        [x+dx, y, z],
        [x+dx, y+dy, z],
        [x, y+dy, z],
        [x, y, z+dz],
        [x+dx, y, z+dz],
        [x+dx, y+dy, z+dz],
        [x, y+dy, z+dz]
    ])
    
    # list of visible edges (hiding occluded edges 0-1, 3-0, 0-4)
    edges = [
        (1, 2), (2, 3), # bottom visible
        (4, 5), (5, 6), (6, 7), (7, 4), # top
        (1, 5), (2, 6), (3, 7)  # vertical visible
    ]
    
    # draw edges
    for i, edge in enumerate(edges):
        if i == 0:
            ax.plot3D(*zip(vertices[edge[0]], vertices[edge[1]]), color=color, linestyle=linestyle, linewidth=2, label=label)
        else:
            ax.plot3D(*zip(vertices[edge[0]], vertices[edge[1]]), color=color, linestyle=linestyle, linewidth=2)

def draw_3d_grid(ax, origin, size, subdivisions, color, alpha, linewidth, linestyle):
    x, y, z = origin
    dx, dy, dz = size
    cols, rows, depth = subdivisions
    
    step_x = dx / cols
    step_y = dy / rows
    step_z = dz / depth
    
    # We want to only show the grid on the 3 visible faces.
    # For elev=20, azim=30, the visible faces of the inner box are:
    # Top face: Z = z + dz
    # Front-left face: X = x
    # Front-right face: Y = y
    
    # Grid on Top face (Z=z+dz)
    for i in range(1, int(cols)):
        ax.plot3D([x+i*step_x, x+i*step_x], [y, y+dy], [z+dz, z+dz], color=color, alpha=alpha, linewidth=linewidth, linestyle=linestyle)
    for j in range(1, int(rows)):
        ax.plot3D([x, x+dx], [y+j*step_y, y+j*step_y], [z+dz, z+dz], color=color, alpha=alpha, linewidth=linewidth, linestyle=linestyle)
            
    # Grid on visible Y face (Y=y+dy)
    for i in range(1, int(cols)):
        ax.plot3D([x+i*step_x, x+i*step_x], [y+dy, y+dy], [z, z+dz], color=color, alpha=alpha, linewidth=linewidth, linestyle=linestyle)
    for k in range(1, int(depth)):
        ax.plot3D([x, x+dx], [y+dy, y+dy], [z+k*step_z, z+k*step_z], color=color, alpha=alpha, linewidth=linewidth, linestyle=linestyle)

    # Grid on visible X face (X=x+dx)
    for j in range(1, int(rows)):
        ax.plot3D([x+dx, x+dx], [y+j*step_y, y+j*step_y], [z, z+dz], color=color, alpha=alpha, linewidth=linewidth, linestyle=linestyle)
    for k in range(1, int(depth)):
        ax.plot3D([x+dx, x+dx], [y, y+dy], [z+k*step_z, z+k*step_z], color=color, alpha=alpha, linewidth=linewidth, linestyle=linestyle)
def draw_layer_3d_diagram(ax, inner_size, gap, title, inner_label):
    w, d, h = inner_size
    
    # Inner box
    draw_3d_box(ax, (0, 0, 0), (w, d, h), '#3b82f6', '-', inner_label)
    draw_3d_grid(ax, (0, 0, 0), (w, d, h), (w, d, h), '#3b82f6', 1, 1, '-')
    
    # Outer box
    outer_w = w + 2 * gap
    outer_d = d + 2 * gap
    outer_h = h + 2 * gap
    draw_3d_box(ax, (-gap, -gap, -gap), (outer_w, outer_d, outer_h), '#ef4444', '--', f'Overlay')
    draw_3d_grid(ax, (-gap, -gap, -gap), (outer_w, outer_d, outer_h), (w, d, h), '#ef4444', 0.6, 1, '--')
    
    # Set proportional aspect ratio
    ax.set_box_aspect([outer_w, outer_d, outer_h])
    
    # Hide axis and panes
    ax.axis('off')
    ax.xaxis.set_pane_color((1.0, 1.0, 1.0, 0.0))
    ax.yaxis.set_pane_color((1.0, 1.0, 1.0, 0.0))
    ax.zaxis.set_pane_color((1.0, 1.0, 1.0, 0.0))
    
    ax.set_title(title, fontsize=18, fontweight='bold', pad=20)
    ax.legend(loc='lower center', bbox_to_anchor=(0.5, -0.15), frameon=False, prop={'size': 16})

# 1. Head: 8x8x8, gap 0.5 (Width=8, Depth=8, Height=8)
ax1 = fig.add_subplot(131, projection='3d')
ax1.set_facecolor('#ffffff')
ax1.view_init(elev=20, azim=30)
draw_layer_3d_diagram(ax1, (8, 8, 8), 0.5, 'Head', 'Inner 8x8x8')

# 2. Torso: 8x12x4, gap 0.25. (Width=8, Depth=4, Height=12)
ax2 = fig.add_subplot(132, projection='3d')
ax2.set_facecolor('#ffffff')
ax2.view_init(elev=20, azim=30)
draw_layer_3d_diagram(ax2, (8, 4, 12), 0.25, 'Torso', 'Inner 8x12x4')

# 3. Arm/Leg: 4x12x4, gap 0.25. (Width=4, Depth=4, Height=12)
ax3 = fig.add_subplot(133, projection='3d')
ax3.set_facecolor('#ffffff')
ax3.view_init(elev=20, azim=30)
draw_layer_3d_diagram(ax3, (4, 4, 12), 0.25, 'Arm/Leg', 'Inner 4x12x4')

fig.patch.set_facecolor('#ffffff')
plt.tight_layout()
plt.savefig('../public/articles/images/skingen_layers.png', dpi=300, bbox_inches='tight', facecolor=fig.get_facecolor(), transparent=False)
print("3D Diagram generated at ./public/articles/images/skingen_layers.png")
