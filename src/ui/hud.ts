const $ = (id: string) => document.getElementById(id)!;

// The on-screen text. Plain DOM over the canvas: crisp at any pixel ratio, free to
// style, and readable by screen readers.
export class Hud {
  private readonly score = $('score');
  private readonly hint = $('hint');
  private readonly speciesName = $('species-name');
  private readonly speciesSub = $('species-sub');

  setScore(cuts: number) {
    this.score.textContent = `cortes: ${cuts}`;
  }

  setHint(text: string) {
    this.hint.textContent = text;
  }

  setSpecies(name: string, detail: string) {
    this.speciesName.textContent = name;
    this.speciesSub.textContent = detail;
  }

  loaded() {
    $('loading').classList.add('done');
  }

  fail(message: string) {
    $('loading').textContent = message;
  }
}
