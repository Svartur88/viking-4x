extends Node
## Design tokens (design-language.md). One place; no hard-coded colours in scenes.

const SEA_DEEP := Color("1E2F3F")
const SEA_SHALLOW := Color("2C4A5E")
const LAND := Color("3C4F33")
const LAND_HIGH := Color("5C6A55")
const SNOW := Color("D9DEE2")
const TIMBER := Color("5A3E2B")
const TIMBER_LIGHT := Color("7A5A40")
const IRON := Color("3A3D42")
const FIRE := Color("E08A2E")
const EMBER := Color("B5502A")
const BONE := Color("EDE6D6")
const INK := Color("1B1B1B")
const MOSS := Color("6B8E4E")
const BLOOD := Color("8E2B2B")
const RUNE := Color("4E7FA6")
const GOLD := Color("D4A548")

## Terrain byte -> colour (map-model.md: 0 land, 1 coast, 2 sea, 3 mountain).
const TERRAIN := [LAND, SEA_SHALLOW, SEA_DEEP, SNOW]

const PAD := 16
const GAP := 12
const TOUCH := 88  ## minimum tap target, one-handed reach (design-language.md)


func panel(bg: Color = TIMBER, border: Color = IRON) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(2)
	s.set_corner_radius_all(8)
	s.content_margin_left = PAD
	s.content_margin_right = PAD
	s.content_margin_top = GAP
	s.content_margin_bottom = GAP
	return s


## A button that reads as primary (fire) or secondary (iron).
func button(text: String, primary: bool = true) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, TOUCH)
	b.add_theme_color_override("font_color", INK if primary else BONE)
	b.add_theme_color_override("font_hover_color", INK if primary else BONE)
	b.add_theme_color_override("font_pressed_color", INK if primary else BONE)
	b.add_theme_color_override("font_disabled_color", Color(BONE, 0.4))
	var base := FIRE if primary else IRON
	b.add_theme_stylebox_override("normal", panel(base, base.darkened(0.3)))
	b.add_theme_stylebox_override("hover", panel(base.lightened(0.1), base.darkened(0.3)))
	b.add_theme_stylebox_override("pressed", panel(base.darkened(0.15), base.darkened(0.4)))
	b.add_theme_stylebox_override("disabled", panel(IRON.darkened(0.2), IRON))
	return b


func label(text: String, size: int = 28, colour: Color = BONE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", colour)
	return l
