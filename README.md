# Pattr

Scoped Reactive DOM Updater 

<img src="https://github.com/jimafisk/pattr/blob/master/pattr.svg" />

## Purpose

This is a companion project to [Pico](https://github.com/jimafisk/custom_go_template). It's a simple JS script iteracts with "p" attributes on HTML markup to provide reactive updates.

It's a similar concept to [AlpineJS](https://alpinejs.dev/), but the main differences are that AlpineJS does way more, and Pattr has an intentionally terse syntax that scopes components so that:
- Parent changes update Child and Grandchild components
- Child changed update Grandchildren, but does nothing to Parents
- Grandchildren do not impact Child or Parents

As you can see, components down the chain can diverge from the reactivity provided by their Parent components. However, if a Parent component is updated, it will resync all descendant components.

## Examples

```
Parent = 2
Child (Parent * 2) = 4
Grandchild (Child + 1) = 5
```

If we increment Parent by 1:

```
Parent = 3
Child (Parent * 2) = 6
Grandchild (Child + 1) = 7
```

If we now increment Child by 1 (diverges from Parent):

```
Parent = 3
Child (Parent * 2) = 7
Grandchild (Child + 1) = 8
```

But if we then increment Parent by 1 (resyncs with Parent):

```
Parent = 4
Child (Parent * 2) = 8
Grandchild (Child + 1) = 9
```
