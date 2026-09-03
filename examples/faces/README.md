# Sample faces

`generated-test-face.jpg` is an **AI-generated synthetic face** — it is not a
real person and is provided for testing the HumanAuthn enroll/authenticate flow.
It is licensed for use in this repository's examples and tests.

`npm run verify:roundtrip` uses this image by default. To test with a different
face, supply your own **locally** (it will not be committed — `fixtures/` and
image files are git-ignored):

```bash
HUMANAUTHN_FACE_IMAGE=./fixtures/me.jpg npm run verify:roundtrip
```

Do not commit real people's face images: they are biometric data, and this is a
public repository.
