# check_distribution.py
import pandas as pd
import matplotlib.pyplot as plt

df = pd.read_csv("data/labels.csv")
print("Valence Distribution:")
print(df['valence'].value_counts().sort_index())

# Visualize
df['valence'].hist(bins=10, edgecolor='black')
plt.xlabel('Valence (0-9)')
plt.ylabel('Count')
plt.title('Training Data Distribution')
plt.show()