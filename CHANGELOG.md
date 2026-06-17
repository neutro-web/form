# Changelog

## [0.2.0](https://github.com/neutro-web/form/compare/v0.1.0...v0.2.0) (2026-06-17)


### Features

* **core:** add isValid boolean|null to FormState with hasValidated tracking ([a0cbf97](https://github.com/neutro-web/form/commit/a0cbf972ae629dc1de0b0538f81d29fc14179e3a))
* **core:** add localStorageAdapter and sessionStorageAdapter ([227786e](https://github.com/neutro-web/form/commit/227786e5e3da9f980aa3621f5f5848372b2743f2))
* **core:** add PersistenceAdapter, PersistenceConfig types, hydrate() to FormInstance ([6957246](https://github.com/neutro-web/form/commit/6957246562f5e46b6eca43879ccc2104440f83ed))
* **core:** add ResetFieldOptions, RESET_FIELD action, and resetField to FormInstance ([7750662](https://github.com/neutro-web/form/commit/7750662d872556f934705edd160a2278b3e6ae64))
* **core:** classValidatorAdapter traverses ValidationError.children for nested DTOs ([6b43870](https://github.com/neutro-web/form/commit/6b43870f08b1a036e2aed624e702194af605d11a))
* **core:** fix isEmpty for FileList; add maxFileSize, minFileSize, fileTypes, maxFiles, minFiles rules ([07fd054](https://github.com/neutro-web/form/commit/07fd05438e95ebd82aebc6f21c43310954baaa46))
* **core:** implement hydrate(), persistence write subscription, and reset/destroy hooks ([b2a3333](https://github.com/neutro-web/form/commit/b2a33339ebdbb72e896410dc06bd5fa656fc3fcd))
* **core:** implement resetField with full test coverage ([f3f8a44](https://github.com/neutro-web/form/commit/f3f8a4433802fbb37f14fe9efd0ce107d7f25bb0))
* **devtools,docs:** track isValid in computeDiff; document isValid field ([8dd10ba](https://github.com/neutro-web/form/commit/8dd10bad8fe73947cc0107375750d7b50b79a29c))
* **devtools:** add DevtoolsPanelOptions type, SSR guard, and duplicate guard stub ([33f3bf6](https://github.com/neutro-web/form/commit/33f3bf6599ca1e45415b90d25ce317f0de47ac44))
* **devtools:** implement createDevtoolsPanel with state render and action log ([0859d91](https://github.com/neutro-web/form/commit/0859d912d5cb6eb07a4eaff5c90a5abec7a62ee6))
* **devtools:** redesign as createNeutroFormDevtoolsPanel with floating overlay and inline mode ([92d7977](https://github.com/neutro-web/form/commit/92d797730b28f5766b0cc1aaa667e7ff8da6f571))
* **persistence:** full test coverage and docs — persistence guide, API ref, and FAQ ([e7dd2c4](https://github.com/neutro-web/form/commit/e7dd2c468652a7b36345b376f6e69bb1efe814ce))
* **playground:** add classValidatorAdapter step to Angular section ([79f5502](https://github.com/neutro-web/form/commit/79f5502d6a252df0f98053b2aaed648a1015615b))
* **playground:** add Devtools Panel step (Step 19) with live mount/unmount demo ([9aeb68c](https://github.com/neutro-web/form/commit/9aeb68ccec3dcd8bcbe3d280b0d591e1cc692fae))
* **testing:** expose resetField on FormFixture ([0bd1cfd](https://github.com/neutro-web/form/commit/0bd1cfdbe2e82d63d5e9ce0f661dd617a2aedb75))
* **types:** add SetOptions interface and ArrayItem&lt;V&gt; utility type ([d51704d](https://github.com/neutro-web/form/commit/d51704dfb5da1751c2b20219fc01f6d3463ab418))
* **types:** add typed overloads to set, validate, and array operations ([c9d5536](https://github.com/neutro-web/form/commit/c9d5536c259973d76a42ae3f6737df7b3c4d89df))
* **types:** conditional-type overloads for set/arrayAppend/arrayInsert — full value-type enforcement on known paths ([3a9d060](https://github.com/neutro-web/form/commit/3a9d060e2a7e99126c1b9dbf36d9812002ea1a14))


### Bug Fixes

* **core:** add present guard to maxFileSize; count bare File as 1 in maxFiles/minFiles ([01843da](https://github.com/neutro-web/form/commit/01843da86853ca288e8f73910842785f86bebbe8))
* **core:** datetime-local DOM sync, adapter resetField exposure, action dispatch test ([455665e](https://github.com/neutro-web/form/commit/455665ed2ca6b785965332af14c791f85ef69d98))
* **core:** fix persistence subscribe leak, double-hydrate, and spurious write ([7d1f438](https://github.com/neutro-web/form/commit/7d1f43870dd149d37e174d6762948196d797bb4e))
* **core:** improve persistence cleanup ordering and document skipFirst rationale ([64b11aa](https://github.com/neutro-web/form/commit/64b11aa1803f72c613f3510305fc947eb50d619c))
* **core:** isValid — handle no-validator early return and stale async epoch ([8257b4e](https://github.com/neutro-web/form/commit/8257b4e84965d5fa835ea6cc55ae136562c6396b))
* **devtools:** correct duplicate-guard warning message in createDevtoolsPanel ([746b644](https://github.com/neutro-web/form/commit/746b644aa9aa416f1f76f01bfef60f5dd00e3216))
* **devtools:** resolve biome lint errors blocking CI ([3a693b9](https://github.com/neutro-web/form/commit/3a693b9b555593821f70be7a1877fd4b77ec23e1))
* **devtools:** teardown must clear shadowRoot not container; verify teardown in test ([b051f32](https://github.com/neutro-web/form/commit/b051f3244d7b381b6e6a32dd004dfa232854f3d6))
* **persistence:** strip excluded paths in reset(newValues), improve timer test coverage ([cf70d2b](https://github.com/neutro-web/form/commit/cf70d2b3a0187f94c33c52071b19330160513374))
* **playground:** restore sidebar scroll with grid-template-rows; add File Validation step ([a2fc140](https://github.com/neutro-web/form/commit/a2fc140312407a4db3328172a9ec03b0b65ab0c9))


### Documentation

* add community page with FAQ, issue guidelines, ecosystem section, and Buy Me a Coffee ([065df39](https://github.com/neutro-web/form/commit/065df391c8cd18db81ebd05d3253a70f76acaa5f))
* add TypeScript guide and update API reference for Feature 1 ([1685fa5](https://github.com/neutro-web/form/commit/1685fa5b46f4bc0e7c4961c5778d7d1f9e9469c6))
* add TypeScript signature to createDevtoolsPanel section ([495c52f](https://github.com/neutro-web/form/commit/495c52f0d9c3499059da1479eddd5d7d085dd833))
* add v0.2.0 design spec ([673fa70](https://github.com/neutro-web/form/commit/673fa70a5c11fcf15a0cb2391f377da126d5a6f7))
* add v0.2.0 implementation plan ([e58b2ec](https://github.com/neutro-web/form/commit/e58b2ecfa264d6feb83cb96a651994a8a559728e))
* apply round-2 spec corrections to v0.2.0 design ([dcc49a1](https://github.com/neutro-web/form/commit/dcc49a1368d0db0965923d57238c2a4f4c4fb08d))
* **community:** expand FAQ with 29 real-world questions across 10 categories ([7331f25](https://github.com/neutro-web/form/commit/7331f252e11189c7ba712a2f63427be3b03701da))
* **community:** fix class-validator FAQ — use classValidatorAdapter, not manual wrapper ([5d9da58](https://github.com/neutro-web/form/commit/5d9da58c23f6a0e32e7ac318a5d8287fba24b7ad))
* **community:** lead Zod/Yup/Valibot FAQ with built-in adapters; add class-validator entry ([c870653](https://github.com/neutro-web/form/commit/c870653d7663505a6b510d0b965d052282cd6bbf))
* correct and harden v0.2.0 design spec ([afd88b6](https://github.com/neutro-web/form/commit/afd88b66eab737708f49818e1e25cbe529eb72ee))
* correct TypeScript guide — accurately describe typed overload limitations ([a3dec6f](https://github.com/neutro-web/form/commit/a3dec6f6e963360215fea54a43ecace0636e32d8))
* document classValidatorAdapter children traversal for Feature 6 ([e92448f](https://github.com/neutro-web/form/commit/e92448f4d47ca18d73a2ea53e014f775480e93c7))
* document createDevtoolsPanel API for Feature 7 ([4a5cd14](https://github.com/neutro-web/form/commit/4a5cd14d7c5f6b9c92fd3493ac29ba2662835f8e))
* document file validation rules and FAQ for Feature 5 ([9fa1c4a](https://github.com/neutro-web/form/commit/9fa1c4a90ed2dfb3fe2971cbc1e8ebd823039a34))
* document path-typo limitation as intentional design choice with roadmap note ([b8f2524](https://github.com/neutro-web/form/commit/b8f25247134394b0bda850ec1875df94cb77dc91))
* document resetField API and FAQ for Feature 2 ([2ddd1f2](https://github.com/neutro-web/form/commit/2ddd1f216f292e525c880cf34ab03380e8360323))
* expand README, api types, getting-started, and typescript guide for v0.2.0 features ([e709e42](https://github.com/neutro-web/form/commit/e709e4273bb4a4d70c08ffceddf9195902c4a01a))
* fix three grounded spec errors found in code-verified review ([2f09bd4](https://github.com/neutro-web/form/commit/2f09bd4b710f12e1ea5dfb702907926255fa2a4d))
* **guides:** add resetField examples to all framework adapter guides ([0135611](https://github.com/neutro-web/form/commit/013561156389eb59384fb7234a436f6262c8e8c4))
* **playground:** add resetField and typed-paths vanilla tutorial steps ([25648fb](https://github.com/neutro-web/form/commit/25648fb912fda3c85b57e2c785ec2d999ec171a4))
* remove scoped package references from user-facing docs ([39ed6d6](https://github.com/neutro-web/form/commit/39ed6d6312431fdc01954028516b0930d79b4bb0))
* update README for v0.2.0 — fix submit API, add new features ([31e578f](https://github.com/neutro-web/form/commit/31e578f4b62529bff1976172276861e6c8cccc80))
* update TypeScript guide to reflect full value-type enforcement on known paths ([e76f08e](https://github.com/neutro-web/form/commit/e76f08e49df2f94ddf65413b23798e94412e48be))
* v0.2.0 audit fixes — playground steps, API gaps, file rules, isValid ([be5ef59](https://github.com/neutro-web/form/commit/be5ef599eac5008b7fb13b7f5fa3e1469694a774))
