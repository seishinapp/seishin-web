# seishin-web

The web client for [Seishin](https://github.com/seishinapp/seishin): guest login via an
ephemeral Ed25519 keypair, directory browsing, native voice over WebTransport, and
PannerNode/HRTF spatial audio rendering.

It talks only to the Seishin server's Canonical Platform API and native CXP/1 protocol over
WebTransport, with no access beyond what a third-party client has.

## Developing

```sh
npm install
npm run typecheck
```

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).
