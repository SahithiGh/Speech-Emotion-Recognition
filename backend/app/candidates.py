"""The lightweight classifiers compared during training. All are scaled with StandardScaler inside a Pipeline,
so scaling is learned from training data only. class_weight='balanced' handles the (small) class imbalance."""
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


def candidate_models(seed: int) -> dict:
    est = {f"SVM (RBF, C={c})": SVC(kernel="rbf", C=c, gamma="scale", class_weight="balanced", random_state=seed)
           for c in (1, 3, 5, 10)}
    est["Logistic regression (C=0.1)"] = LogisticRegression(C=0.1, max_iter=3000, class_weight="balanced")
    est["Logistic regression (C=1)"] = LogisticRegression(C=1.0, max_iter=3000, class_weight="balanced")
    est["Random forest (300 trees)"] = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced",
                                                             n_jobs=2, random_state=seed)
    est["Gradient boosting (histogram)"] = HistGradientBoostingClassifier(max_iter=150, learning_rate=0.08, max_leaf_nodes=15,
                                                                         class_weight="balanced", random_state=seed)
    return est


def make_pipeline(name: str, seed: int, probabilities: bool = False) -> Pipeline:
    clf = candidate_models(seed)[name]
    if probabilities and isinstance(clf, SVC):
        clf.set_params(probability=True)   # Platt scaling, needed for per-class scores
    return Pipeline([("scale", StandardScaler()), ("clf", clf)])
