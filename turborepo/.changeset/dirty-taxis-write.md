---
"@slipstream/metadata": major
---

enhanced functionality/perf -- Img and Doc handlers isomorphic by design. The extractor class that unites the img and doc classes via mixins for optimal perf probes props passed in by making either (a) fetch requests if a url is detected (pass remote urls in with caution in client runtime contexts) or (b) handling buffers directly (ideal for client side contexts).
