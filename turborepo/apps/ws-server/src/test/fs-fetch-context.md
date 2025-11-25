```ts
import fsSync from "fs";
import { relative } from "path";
import { FsTmp } from "@/fs-tmp/index.ts";

export class FsFetch extends FsTmp {
  constructor(public override cwd: string) {
    super((cwd ??= process.cwd()));
  }
  /**
   *
   * @param inputUrl remote url to fetch data from
   * @param outputPath desired output path relative to the cwd
   * @param useDetectedExtension optional, defaults to true
   *
   * if `useDetectedExtension` is false you must include the file extension in your output path &rarr;
   *
   *  🚫 'public/assets/image-1'
   *
   *  ✅ 'public/assets/image-1.png'
   *
   * @description
   * This method is designed for all files regardless of size, but especially for
   * larger files that may not fit into memory (it intelligently determines the best approach on the fly)
   * For files > 100 MB, it streams the data directly to disk instead of loading it all into memory
   */
  public async fetchRemoteWriteLocalLargeFiles<
    const I extends string,
    const O extends string
  >(inputUrl: I, outputPathI: O, useDetectedExtension = true) {
    if (!URL.canParse(inputUrl))
      throw new Error(`invalid URL ${inputUrl} is unable to be parsed`);
    try {
      // comes from my @d0paminedriven/meta package which my @d0paminedriven/fs package extends under the hood
      const meta = await this.extractRemote(inputUrl, 4096 * 48);

      const ext = (meta.format ?? "bin") as keyof typeof this.mimeTypeObj;
      const size = meta.byteSize ?? 0;

      const { unit, value } = this.autoFileSizeRaw(size);

      console.log(
        `fetchRemoteWriteLocalLargeFiles extracting a file of size ${value} ${unit}`
      );

      const formattedPath = useDetectedExtension
        ? `${outputPathI}.${ext}`
        : outputPathI;

      this.generateDirIfDNE(this.pathHandler(formattedPath), {
        recursive: true
      });

      const writeStream = fsSync.createWriteStream(
        relative(this.cwd, formattedPath)
      );

      const res = await fetch(inputUrl);

      if (!res.ok || !res.body) {
        throw new Error(`Failed to fetch asset: ${res.statusText}`);
      }

      const { promise, reject, resolve } = Promise.withResolvers();

      writeStream.on("finish", () => resolve({}));
      writeStream.on("error", () => reject({}));

      const reader = res.body.getReader();

      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;
          writeStream.write(value);
        }
        writeStream.end();
      };

      await pump();

      await promise.then(() => {});
      return;
    } catch (err) {
      console.error(`[fetchRemoteWriteLocalLargeFiles error]:`, err);
    }
  }
}
```

---

## xAI logs from running src/test/tmp.ts

```bash
fetchRemoteWriteLocalLargeFiles extracting a file of size 8.576637268066406 MB
[Python] Uploading 8993256 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-hug6wmvghcuwnbiipsljnheh-aliased-1764057636655-phsr2r.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 25.4912109375 KB
[Python] Uploading 26103 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-l8we8qwi0mvae9l8lx1d0qaw-aliased-1764057641205-2q849y.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 830.294921875 KB
[Python] Uploading 850222 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-fwczvjitoy62w1zgrim4x0et-active-1764057641873-xmszq4.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 184.685546875 KB
[Python] Uploading 189118 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-wtywhioyfurelljpivpbgdk3-active-1764057642768-jpv2wy.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 1.5530157089233398 MB
[Python] Uploading 1628455 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-k8nuiu6bc724rmxynogcgpgo-aliased-1764057643436-7uo11r.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 1.5530157089233398 MB
[Python] Uploading 1628455 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-zu0j5qrjouzfmokwrpyn3s84-aliased-1764057644395-psnnur.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 184.685546875 KB
[Python] Uploading 189118 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-v8m2tieq5gwdukkelkizdqw4-active-1764057645372-gyk82h.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 79 KB
[Python] Uploading 80896 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-o2r6ena5owvkm8pmo2ihsri2-active-1764057645986-yyabpt.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 240.623046875 KB
[Python] Uploading 246398 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-l10f1ujha2254c2ejap5mfyd-active-1764057646564-b5w5mc.pdf
fetchRemoteWriteLocalLargeFiles extracting a file of size 199.7685546875 KB
[Python] Uploading 204563 bytes from disk to xAI collection...
cleaned up tmp file xai-tmp-nrr6h4r4480f6kviycyo1zhf-bnlvc59g1kxbhf8jvtv5kxiv-active-1764057647180-bk6fpx.pdf
duration: 11184.785476000001
[
  {'file_id': 'file_2f9233b0-f863-4df6-9a5c-a6c69c9e5793', 'name': 'j130mnh0apkj9e79j7dkad0m-r145swovfvhh5lgvlhdkxlbq-hug6wmvghcuwnbiipsljnheh-document.pdf', 'size_bytes': 8993256, 'content_type': 'application/pdf', 'created_at': 1764057640, 'hash': 'e984f5757751d53c9d433127bc8925326b0d556168d90264421113b22f1c1d84', 'created_at_nanos': 528439010, 'status': 1},
  {'file_id': 'file_0af41efe-9dbf-403a-b6f1-d0046e01c063', 'name': 'q2128v4qzro7ac6duoblwouf-loo3n7vz170z57utm4u17ht7-l8we8qwi0mvae9l8lx1d0qaw-document.pdf', 'size_bytes': 26103, 'content_type': 'application/pdf', 'created_at': 1764057641, 'hash': 'cd61c08e0820660520e7f6afb2de24d11b1d772a3b16d6dd79d1f50ea1d7c016', 'created_at_nanos': 378575492, 'status': 1},
  {'file_id': 'file_deefa7ab-1e88-42bd-bbb7-88b47d754e4e', 'name': 'i8souo338mj5jxs717551gka-dynsuggfzlc0odz3xglg9frh-fwczvjitoy62w1zgrim4x0et-document.pdf', 'size_bytes': 850222, 'content_type': 'application/pdf', 'created_at': 1764057642, 'hash': 'c865a9ed2092ee9136b389007537e3311f9ef1c7e1601e8a799bdcf9c8821529', 'created_at_nanos': 270290311, 'status': 1},
  {'file_id': 'file_e5765a2d-4119-4252-ba47-55d8a1ca622b', 'name': 'ryens71d94qhfuyqk4yk48ki-mt6dv8dw4ne3ke9zotzgnyu5-wtywhioyfurelljpivpbgdk3-document.pdf', 'size_bytes': 189118, 'content_type': 'application/pdf', 'created_at': 1764057642, 'hash': '31e7d1c48d8d397655226332454e01480fc9d123da5b2ce4ab9dee65c5b370c7', 'created_at_nanos': 946832810, 'status': 1},
  {'file_id': 'file_b5a38080-a229-4cfb-ae9b-e8d4caa12ba4', 'name': 'z2qy96tc4n1zc2f3eickr5pa-f84mrpryedsj04a0n3x9k918-k8nuiu6bc724rmxynogcgpgo-document.pdf', 'size_bytes': 1628455, 'content_type': 'application/pdf', 'created_at': 1764057643, 'hash': 'd7f9eedd6d4ae1a35d61ec2dbfa388d5ad4b88d6fd2ee48dc16715427fd611ec', 'created_at_nanos': 878002742, 'status': 1},
  {'file_id': 'file_7b72c4fa-277e-4af0-84fa-20b924790627', 'name': 'aw429ghqhzkfvo2f6ksyo1vl-ag57n5zzpp84ej9md3uomzjy-zu0j5qrjouzfmokwrpyn3s84-document.pdf', 'size_bytes': 1628455, 'content_type': 'application/pdf', 'created_at': 1764057644, 'hash': 'd7f9eedd6d4ae1a35d61ec2dbfa388d5ad4b88d6fd2ee48dc16715427fd611ec', 'created_at_nanos': 855446648, 'status': 1},
  {'file_id': 'file_b20cbc5e-f41c-427e-8070-905035966f0c', 'name': 'aw429ghqhzkfvo2f6ksyo1vl-s430anb3y5yvs5glawnmpqix-v8m2tieq5gwdukkelkizdqw4-document.pdf', 'size_bytes': 189118, 'content_type': 'application/pdf', 'created_at': 1764057645, 'hash': 'bb9083dc65045043ce5d934facdcc838a53e6e928802bd1780105582dd8f2601', 'created_at_nanos': 490620802, 'status': 1},
  {'file_id': 'file_731d7314-5a0c-4002-b414-b2e86932f4c2', 'name': 'aw429ghqhzkfvo2f6ksyo1vl-s430anb3y5yvs5glawnmpqix-o2r6ena5owvkm8pmo2ihsri2-document.pdf', 'size_bytes': 80896, 'content_type': 'application/pdf', 'created_at': 1764057646, 'hash': '9f33fac7b1421d09fd47d7b2801aa2d9e34c9d12ff4c4ba446c18a616d407c32', 'created_at_nanos': 82870797, 'status': 1},
  {'file_id': 'file_9949b2ed-75f1-4d79-ba2a-f16e2cb28227', 'name': 'aw429ghqhzkfvo2f6ksyo1vl-s430anb3y5yvs5glawnmpqix-l10f1ujha2254c2ejap5mfyd-document.pdf', 'size_bytes': 246398, 'content_type': 'application/pdf', 'created_at': 1764057646, 'hash': 'f8c953c5e69ecce884fdfd8b7dc63b2c80873e6afaf631bf970be13eb754e233', 'created_at_nanos': 689813097, 'status': 1},
  {'file_id': 'file_75ab40aa-7fcd-4492-831f-147ff02b7d45', 'name': 'aw429ghqhzkfvo2f6ksyo1vl-xz5p7fyykdqpgte4dtqellkc-bnlvc59g1kxbhf8jvtv5kxiv-document.pdf', 'size_bytes': 204563, 'content_type': 'application/pdf', 'created_at': 1764057647, 'hash': 'af9b3bf98d72c5a91595c637407d5904f4989f20f730986a0264f3cdb38aa12f', 'created_at_nanos': 352121617, 'status': 1}
]
```

## Anthropic Logs from running src/test/upload-test.ts

```bash
fetchRemoteWriteLocalLargeFiles extracting a file of size 61.88671875 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-vjkcb9i4nhowqeufy5kx9xew-aliased-1764057658602-8u0jin.jpg from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 40.6201171875 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-rfli3opca1tl3kl951adfo09-aliased-1764057659658-yd3fte.jpg from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 935.23046875 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-e122non85hxmvcaosnb4exr8-active-1764057660430-4hh7p7.png from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 449.7548828125 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-vhfxhij3y1eeotxli0mla0fp-aliased-1764057661521-c2tv1b.jpg from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 22.0166015625 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-r807zmxs2akwe2ufq68u0ole-aliased-1764057662421-0cad4z.png from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 488.640625 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-wdfo7mllvdjx2tcs9d1rg7dx-active-1764057663680-00agza.jpeg from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 379.73046875 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-kc61vda6xttsa9ct1bgglory-active-1764057664604-e4ruvd.jpeg from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 500.2431640625 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-pltocpy1r7h606jalirngm4i-active-1764057665488-qfqo98.jpeg from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 207.177734375 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-lfgw52yz6lmien6sjxyn4lxs-active-1764057666525-ouasxi.jpeg from tmp
fetchRemoteWriteLocalLargeFiles extracting a file of size 79.9384765625 KB
removing anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-mqm1jylj3ptfnkdta6et1ixz-aliased-1764057667352-yt37n1.png from tmp
duration: 10039.863625 ms
[
  {
    type: 'file',
    id: 'file_011CVUFobrBRkSyTWbAj5zUU',
    size_bytes: 63372,
    created_at: '2025-11-25T08:00:59.191000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-vjkcb9i4nhowqeufy5kx9xew-aliased-1764057658602-8u0jin.jpg',
    mime_type: 'image/jpeg',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFofB7MiPpBrtiPAdyH',
    size_bytes: 41595,
    created_at: '2025-11-25T08:00:59.969000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-rfli3opca1tl3kl951adfo09-aliased-1764057659658-yd3fte.jpg',
    mime_type: 'image/jpeg',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFojpAKzTYavEFAyndJ',
    size_bytes: 957676,
    created_at: '2025-11-25T08:01:01.054000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-e122non85hxmvcaosnb4exr8-active-1764057660430-4hh7p7.png',
    mime_type: 'image/png',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFooa8fqDKxjdgGWjQK',
    size_bytes: 460549,
    created_at: '2025-11-25T08:01:01.933000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-vhfxhij3y1eeotxli0mla0fp-aliased-1764057661521-c2tv1b.jpg',
    mime_type: 'image/jpeg',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFou1JoM63Ygs57Rfc2',
    size_bytes: 22545,
    created_at: '2025-11-25T08:01:03.204000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-r807zmxs2akwe2ufq68u0ole-aliased-1764057662421-0cad4z.png',
    mime_type: 'image/png',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFoxyv8fU8xU7s3D8qQ',
    size_bytes: 500368,
    created_at: '2025-11-25T08:01:04.134000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-wdfo7mllvdjx2tcs9d1rg7dx-active-1764057663680-00agza.jpeg',
    mime_type: 'image/jpeg',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFp2mdWaLvc4vzUHkjx',
    size_bytes: 388844,
    created_at: '2025-11-25T08:01:05.020000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-kc61vda6xttsa9ct1bgglory-active-1764057664604-e4ruvd.jpeg',
    mime_type: 'image/jpeg',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFp7AoNHLvDHpXAnHEG',
    size_bytes: 512249,
    created_at: '2025-11-25T08:01:06.049000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-pltocpy1r7h606jalirngm4i-active-1764057665488-qfqo98.jpeg',
    mime_type: 'image/jpeg',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFpAgsd3pGUvBdYxhvm',
    size_bytes: 212150,
    created_at: '2025-11-25T08:01:06.872000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-lfgw52yz6lmien6sjxyn4lxs-active-1764057666525-ouasxi.jpeg',
    mime_type: 'image/jpeg',
    downloadable: false
  },
  {
    type: 'file',
    id: 'file_011CVUFpEByX6q2CeKxNwhRe',
    size_bytes: 81857,
    created_at: '2025-11-25T08:01:07.691000Z',
    filename: 'anthropic-tmp-nrr6h4r4480f6kviycyo1zhf-mqm1jylj3ptfnkdta6et1ixz-aliased-1764057667352-yt37n1.png',
    mime_type: 'image/png',
    downloadable: false
  }
]
```
