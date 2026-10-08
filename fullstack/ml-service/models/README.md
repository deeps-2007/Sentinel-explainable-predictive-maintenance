# models/

This directory is **intentionally empty** in the distributed package.

## Why there are no model files here

The trained models are serialized with `joblib`, which uses Python's `pickle`
format. Antivirus and model-scanning tools (Windows Defender, ClamAV,
`picklescan`, ProtectAI `modelscan`, and others) flag **every** `.pkl` file
heuristically, because `pickle.load()` is capable of executing arbitrary code
during deserialization. That warning is about the *file format*, not about any
specific file's contents — but it means shipping `.pkl` files inside a zip
reliably trips virus scanners.

Rather than ask you to add an antivirus exclusion for a binary you didn't
build, this package ships **no binaries at all**. Every file is plain-text
source you can read. You generate the models locally in one command.

## Generate the models

```bash
cd ml-service
python -m src.train_models
```

Takes roughly 5-10 seconds on the included 10,000-row dataset. It writes:

```
models/model_overall_failure.pkl
models/model_TWF.pkl
models/model_HDF.pkl
models/model_PWF.pkl
models/model_OSF.pkl
models/model_RNF.pkl
models/training_metrics.json
```

These files are produced on your machine, by your Python interpreter, from the
training script in `src/train_models.py` — so you can see exactly what goes
into them.

## Using the real UCI dataset

`data/ai4i2020.csv` is a **simulated** dataset matching the AI4I 2020 schema.
To train on the real data, download it from the UCI repository, save it over
`data/ai4i2020.csv`, and rerun the command above. No code changes needed.

## If you skip this step

The ML service starts fine but returns HTTP **503** with a message telling you
to train, and the backend surfaces that as
`ML service error (503): Model artifact ... not found`.
