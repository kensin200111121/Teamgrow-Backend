const SizeStyle = Quill.import('attributors/style/size');
const Parchment = Quill.import('parchment');
SizeStyle.whitelist = ['0.75em', '1.5em', '2em'];
Quill.register(SizeStyle, true);
const FontStyle = Quill.import('attributors/style/font');
Quill.register(FontStyle, true);
let Block = Quill.import('blots/block');
Block.tagName = 'DIV';
Quill.register(Block, true);

var quill = new Quill('#editor', { readOnly: true });
const delta = quill.clipboard.convert(config.description);
quill.setContents(delta, 'silent');

const pixelLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const TAB_MULTIPLIER = 3;
class IndentAttributor extends Parchment.Attributor.Style {
  add(node, value) {
    if (value === '+1' || value === '-1') {
      const indent = this.value(node) || 0;
      value = value === '+1' ? indent + 1 : indent - 1;
    }
    if (value <= 0) {
      this.remove(node);
      return true;
    } else {
      return super.add(node, `${value * TAB_MULTIPLIER}em`);
    }
  }

  value(node) {
    var value = (parseFloat(super.value(node)) || 0) / TAB_MULTIPLIER || 0;
    return parseInt(value + '');
  }
}

const IndentStyle = new IndentAttributor('indent', 'margin-left', {
  scope: Parchment.Scope.BLOCK,
  whitelist: pixelLevels.map((value) => `${value * TAB_MULTIPLIER}em`),
});

Quill.register({ 'formats/indent': IndentStyle }, true);
